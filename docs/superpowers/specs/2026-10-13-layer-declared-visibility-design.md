# Layer-declared visibility

Prep PR 2 for the heliosphere shell Layer. Each Layer declares what it can show and label, as static data; every table core keeps by hand about fades, tour cues, focus recession, label switches and panel toggles is derived from that data or deleted. Design settled in `docs/grill-sessions/layer-declared-fades-2026-10-13.md` (Q1–Q10); this spec states the result.

## Goal

Adding a toggleable, fading Layer needs no edit in a core file beyond the composition lists. Today it needs a hand row in seven tables, a fade row with a renderer-reading guard, a tour action row and, for a label, a scoped-alias row and a label-home row.

Behaviour is unchanged except where "Behaviour changes" says otherwise.

It ships as two PRs (ruled 2026-10-15, SPLIT): a behaviour-neutral ground-prep PR first ("Ground preparation" below), then the visibility PR on top of it. The rest of this spec describes the architecture after both; items the prep PR delivers are marked (prep).

## The flow

```
settings switch ─┐
                 ├─► target(address, item) = switch && present ─► fade controller ─► × recession × clip ─► pass / label producer
asset present  ──┘
```

- **switch**: one boolean in settings, located by the entry (`settings[cluster].<field>`, or `settings[cluster].items[item].<field>`). For a per-item show entry whose cluster also has a section switch (`settings[cluster].enabled`), the switch for item X is `settings[cluster].enabled && settings[cluster].items[X].enabled`. Core applies this one rule to every per-item show entry, and the data decides where it binds: today `cosmicWebDensity` and `starCatalogs` have a boolean `enabled`; `galaxyCatalogs` and `structures` have none, so their items resolve on the item switch alone. No consumer ANDs the two by hand. The bare address (`cosmicWebDensity`) flips the section switch where there is one, and writes every item where there is none (`survey`); the scoped one (`cosmicWebDensity:<field>`) flips one item. A label entry reads `labelEnabled` alone: a label that should vanish with its section does so through `of`. Ruled 2026-10-14 (SQ3, U1).
- **present**: `slot.committed() !== null` for the slot whose asset row `gates` this address (and item); `true` when no asset row gates it. Not `slot.state()`: a reload keeps the previous upload drawn, and `committed()` is the one reading of "has a committed value" (`AssetSlot.d.ts`).
- **target** is recomputed whenever either input changes: a settings write, or a notification from a gating slot. The boot seed is the target at boot.
- The fade controller animates toward the target (cue `over`, else the defaults in `fadeController.ts`). Core multiplies in focus recession and the clip channel, and hands the result to the consumer as a plain number. For a label entry with `of`, the clip factor is its own address's clip times its `of` entry's clip (U7), so `fade(['constellations'], …)` still dims the names with the lines, as today. The rule is the same for every `of` label.

## Contracts

### Entries

```ts
// src/@types/engine/layer/VisibilityEntry.d.ts
export type VisibilityEntry = ShowEntry | LabelEntry;

type Common = {
  readonly cluster?: string;              // settings cluster; defaults to `key` (show) / required for labels
  readonly items?: readonly string[];      // per-item: settings[cluster].items[id].<field>
  readonly recession?: 'strong' | 'mild';  // focus recession; omitted = does not recede
};
export type ShowEntry = Common & { readonly key: string; readonly field?: 'enabled' };
export type LabelEntry = Common & {
  readonly label: string;   // field is labelEnabled
  readonly cluster: string;
  readonly of?: string;     // a ShowKey: the thing it labels; its target also requires that entry's target
};
```

(`Common`, `ShowEntry`, `LabelEntry` each get their own `@types` file per the one-type-per-file rule; shown together here.)

`of` is typed `string` because `ShowKey` derives from the entries, so `of?: ShowKey` would be circular. `appVisibility.ts` carries a compile-time check that every declared `of` is a `ShowKey`: a misspelled `of` fails `tsc`. The item rule below is checked by a test, because the type cannot see item lists.

Each Layer exports its entries from `src/layers/<layer>/visibility.ts` as `as const satisfies readonly VisibilityEntry[]`, and its `defineLayer` declares `visibility: <that tuple>`. `recession` strengths keep today's values (`STRONG_RECESSION = 0.15`, `MILD_RECESSION = 0.25`).

### Addresses (derived types)

```ts
// src/compositions/appVisibility.ts — imported per Layer from its own visibility.ts,
// NOT read off APP_COMPOSITION (circular alias; see galaxyCatalog/state/slices.ts:4-6)
export const APP_VISIBILITY = [...galaxyCatalogVisibility, ...bodyVisibility, /* every Layer */] as const;

type Entries = (typeof APP_VISIBILITY)[number];
export type ShowKey = Extract<Entries, { key: string }>['key'];
export type LabelAddress = `label:${Extract<Entries, { label: string }>['label']}`;
export type VisibilityAddress = ShowKey | LabelAddress;                 // atomic: cues, clip channel
export type ScopedVisibilityAddress =                                    // one item
  | `${ShowKeyWithItems}:${ItemOf<…>}`
  | `label:${LabelWithItems}:${ItemOf<…>}`;
export type VisibilityArg = VisibilityAddress | 'labels';                // 'labels' = every LabelAddress
```

Exact generic plumbing (`ItemOf`, `ShowKeyWithItems`) is the plan's; the requirement is that `hide(['flwo'])`, `show(['label:structure:bogus'])` and `fade(['survey:bogus'])` fail to compile, as today.

- Fade identity: `{ address: VisibilityAddress; item?: string }`, replacing the `FadeId` union.
- The `'labels'` aggregate expands to every `LabelAddress` in `APP_VISIBILITY` order.

### Gating (asset rows)

```ts
// AssetWiringRow gains:
readonly gates?: VisibilityAddress | { readonly address: VisibilityAddress; readonly item: string };
```

An address/item is gated exactly when some asset row names it. Today's guards map to: localBubble, constellations, cosmicWebFilaments, flow (single); galaxyCatalog `survey` and `cosmicWebDensity` (per item; the row knows both its `code` and the item `id`). The star catalog's streamed survey rows gate `{ address: 'starCatalog', item: id }` the same way (new: the star catalog had no fade row). A slot that does not hold one item's whole drawn data gates nothing: the structure catalog's bulk `.ccat` sits behind three categories that also draw seeded rings, and the famous-star meta sidecar draws nothing. Both keep today's behaviour.

### Consumers

- **Passes and planners**: `ContentPass` and `FrameContentPlanner` gain `readonly fade?: ShowKey`. Core computes the value before `enabled`, skips the pass when it is 0 (every item 0 for a per-item entry), and passes it to `enabled`, `draw`, `pickEnabled` and `drawPick`: `number` for an entry without items, `Readonly<Record<ItemId, number>>` with items. One value gates draw and pick (SQ2). A planner gets the same value as a trailing argument to `plan` and is never skipped: its output feeds passes that gate themselves (U6).
- **Label producers**: every `LayerScreenLabel` / world-label row that draws labels declares `readonly label: <label name>`; there is no other form (ruled 2026-10-14: no special case for constellations or zone-of-avoidance labels). Core skips the producer when no item is live (an item is live while its held target is 1 or its raw fade is above 0), and otherwise passes the value (`number` or `Record`) as a third argument to `produceLabels`.
- **Near spheres** (V2): a Layer that draws opaque spheres on the NEAR0 row declares them through `nearSpheres` (contract below), and core reads them from there for NEAR0's depth range and for the scene occluders. Core binds each source's `live(item)` to core's one liveness predicate (the one the producer skip uses) for the entry the source names in `fade`; core never names the address itself, and the source never reads a switch or a fade. The star Layer is today's one source: its seeded star helpers (`visibleStars`, `positionedVisibleStars`, `partitionStarsByResolution`, `PositionedStar`) move into it (prep), so no core file names `starCatalog`.
- **Galaxy draw mask** (V3): the galaxy catalog's per-source bitmask is a consumer's skip of its own items, not core state. The Layer builds it from its handed `survey` record (`sourceMaskOf(fade)`: a catalog's bit is set while its value is above 0), once per `plan`, for the disk walk, the hi-res famous planner and the structure member count. The point pass needs no mask: its renderer already skips a source whose opacity is exactly 0, and its pick filters on the same value (SQ2). `ReadyFrameContext` and `FrameContextInput` lose `visibleSourceMask`; `runFrame`, the cubemap capture and the pick context derive nothing for galaxies. `deriveSourceMasks` moves into the Layer as `sourceMaskOf`, so no core file names `survey` (prep, still on today's switch and fade reads, keeping today's pick split).
- **Star spheres** (V1): both sphere passes hand their star's catalog value to the sphere renderer as an opacity, which the fragment emits as alpha (`TintedSphereUniforms.opacity`, in the struct's existing trailing pad, so the block stays 80 bytes). The pipeline blends straight-alpha OVER (the cloud shell's factors) and keeps depth test and depth write, so at opacity 1 it draws exactly as the opaque replace does today. The slot and the blend land in the prep PR at a fixed opacity of 1; the visibility PR hands the value. No frame-order change: the spheres are the only content of the NEAR0 row in the foreground chain.
- **`of`**: a label entry may name the show entry it labels. Its target is then `of`'s target && its own switch && present, so hiding the thing hides its label, and the label fades with it. `of` works per item: an item-less label names an item-less show entry; a per-item label names a per-item show entry that has every one of the label's items, and label item X follows show item X. Any other pairing (a label item the `of` entry lacks, or mixed item shapes) fails the `APP_VISIBILITY` test; there is no fallback. Labels that today vanish with their thing declare `of`: constellation names, zone-of-avoidance lettering and light-time captions (with a new `labelEnabled` switch, default on, in their cluster); structure labels, which follow their ring by a hand gate (U3); star captions, which follow their star by a hand AND (`captionFadeRules.ts` `subjectVisible`, U2). Labels that are independent today (Milky Way, famous galaxy, body, black hole, the Voyager captions) do not declare `of`; making every label follow its thing is a later step.
- **Claimed body captions** (M4): core's scene-body captions skip every body id that a label entry other than their own (`label:body`) lists in its `items`, so the Layer that claims a body captions it and core does not. The set is derived once from the composed label entries; nothing hand-lists it. Their own entry is excluded because its items are caption categories, and the Earth category's id is also Earth's body id. Today the missions entry is the one claimant (`items: SAMPLED_BODY_IDS`); this replaces the prep PR's `SAMPLED_BODY_IDS` filter in `sceneBodyLabels.ts`. The label name is one constant in `src/data/labels/` that the core row and the claim lookup share.
- **Clip channel**: `ClipOpacityChannel` is keyed by `VisibilityAddress`; the clip factor stays per address, not per item, as today.
- **Panel rows**: a `labelsAndGuides` ui contribution may be `{ slot: 'labelsAndGuides', content: { toggle: ShowKey, label: string } }` (SQ7); core (`selectToggleRows`) builds the checkbox from the entry's switch and writes through `setVisibility`. The Orbit trails checkbox is the body Layer's row of this shape (U4); the Labels & guides section hand-authors no toggle.

### Near spheres

```ts
// Layer gains:
nearSpheres?(runtime: Runtime): NearSphereSource;

// src/@types/engine/frame/{NearSphere,NearSphereSource,NearSphereProvider}.d.ts
type NearSphere = { readonly positionMpc: Readonly<Vec3>; readonly surface: BodySurface };
type NearSphereSource = {
  readonly fade: ShowKey; // the entry whose items `live` answers for
  spheres(input: {
    readonly bodyStates: ReadonlyMap<BodyId, BodyState>; // the frame's one sample
    readonly camPosMpc: Readonly<Vec3>;
    readonly pxPerRad: number;
    readonly live: (item: string) => boolean;
  }): readonly NearSphere[]; // the opaque spheres this source draws on NEAR0 for that camera
};
type NearSphereProvider = (camPosMpc: Readonly<Vec3>, pxPerRad: number) => readonly NearSphere[];
// ReadyFrameContext.positionedStars → nearSpheres: NearSphereProvider (bound once per frame,
// like bodyPose); deriveView (NEAR0 range, outer radius) and sceneOccluderBodies (inner
// radius) both call it with their own camera and pixel scale.
```

The source returns surfaces, not radii: the range spans the outer bound and the occluders take the inner bound (`sceneOccluderBodies.ts` header), so core picks the radius per consumer. The field-star sphere stays out of the set, as today.

### Writes

```ts
// src/state/settings/setVisibilityAction.ts, handled in settingsReducer.ts beside mergeSnapshot
export const setVisibility = createAction<{
  cluster: string; item?: string; field: 'enabled' | 'labelEnabled'; on: boolean;
  overMs?: number; // SQ4 path (U5): the cue's duration, read by the reactive fade sync; never stored
}>('settings/setVisibility');
```

Writes `settings[cluster][field]`, or `settings[cluster].items[item][field]`. `overMs` is part of the SQ4 path and lands only if the plan's live-saga test shows that today's reactive sync pre-empts a cue's `over` (its cue-path task). It then carries the cue's duration with the write: the reactive settings sync is the only sync, it animates over `overMs` (`0` snaps; absent means the default durations), and `applySceneEffect` keeps no explicit sync of its own. If the test passes on today's code, `overMs` is not added and the cue path syncs explicitly after its writes. Every item record is complete, so the write never creates an item. The one record that looked partial, `blackHoles.items`, is made complete in the prep PR: its type already says `Record<BlackHoleId, …>`, but `initialState.ts` hand-lists Sgr A* and `setBlackHoleLabelEnabled` replaces the whole item (`items[id] = { labelEnabled }`). The fix derives `initialState` from the black-hole id list and makes the reducer write the field. Cues (`show`, `hide`, scoped entries) and panel rows dispatch it. Layer panels with richer UI keep their own setters.

## Per-Layer entries

| Layer | Entries |
|---|---|
| localBubble | `{ key: 'localBubble', recession: 'strong' }` |
| constellations | `{ key: 'constellations', recession: 'strong' }`, `{ label: 'constellations', cluster: 'constellations', of: 'constellations', recession: 'strong' }` |
| cosmicWebFilaments | `{ key: 'cosmicWebFilaments', recession: 'strong' }` |
| flow | `{ key: 'flow' }` |
| lightTime | `{ key: 'lightTime' }`, `{ label: 'lightTime', cluster: 'lightTime', of: 'lightTime' }` |
| zoneOfAvoidance | `{ key: 'zoneOfAvoidance' }`, `{ label: 'zoneOfAvoidance', cluster: 'zoneOfAvoidance', of: 'zoneOfAvoidance' }` |
| missions | `{ key: 'missionTrails', cluster: 'missionTrails' }`, `{ label: 'missions', cluster: 'missions', items: SAMPLED_BODY_IDS, recession: 'mild' }`; panel row `{ toggle: 'missionTrails', label: 'Mission trails' }`. The show switch is the `missionTrails: { enabled }` cluster, split out of `missions` in the prep PR (M1); `missions` keeps `craft` and `speed`. The label entry is the Voyager captions, whose producer moved from core into this Layer in the prep PR, with the selected-craft emphasis dim inside it (M2). Its switch is the Layer's own (M3): per craft, like its per-item siblings (`blackHoles`, `bodies`), so `missions` gains `items: Record<craft id, { labelEnabled }>`, derived from `SAMPLED_BODY_IDS` like the black-hole record, every craft on by default, no panel row (behaviour change #13). Its `items` also claim the craft from core's body captions (M4, "Claimed body captions"). No `of` (the captions are independent of the trails today); `mild` is their recession today. No gate (its tracks arrive by saga into core's `trajectoryRegistry`, not an asset row). |
| cosmicWebDensity | `{ key: 'cosmicWebDensity', items: FIELD_IDS, recession: 'strong' }` (one entry: the section switch and the per-field switches combine by the core rule; the `cosmicWebDensityField` key goes) |
| milkyWay | `{ key: 'milkyWayDisk', cluster: 'milkyWay', recession: 'strong' }`, `{ label: 'milkyWay', cluster: 'milkyWay' }` |
| galaxyCatalog | `{ key: 'survey', cluster: 'galaxyCatalogs', items: GALAXY_CATALOG_IDS }`, `{ label: 'famousGalaxy', cluster: 'galaxyCatalogs', items: <galaxy catalogs with bearsLabel>, recession: 'mild' }` |
| structure | `{ key: 'structureRing', cluster: 'structures', items: STRUCTURE_IDS, recession: 'mild' }`, `{ label: 'structure', cluster: 'structures', items: STRUCTURE_IDS, of: 'structureRing', recession: 'mild' }` |
| starCatalog | `{ key: 'starCatalog', cluster: 'starCatalogs', items: STAR_CATALOG_IDS }`, `{ label: 'starCatalog', cluster: 'starCatalogs', items: <label-bearing star catalogs>, of: 'starCatalog', recession: 'mild' }`; `nearSpheres` source `{ fade: 'starCatalog', … }` |
| blackHoles | `{ label: 'blackHole', cluster: 'blackHoles', items: BLACK_HOLE_IDS, recession: 'mild' }` |
| body (new `layer.ts`) | `{ key: 'orbitTrails' }`, `{ label: 'body', cluster: 'bodies', items: <label-bearing body ids>, recession: 'mild' }`; panel row `{ toggle: 'orbitTrails', label: 'Orbit trails' }` |

The star show entry declares no `recession`: the star layers have no fade row today, so they do not recede. Every star pass, the star planner and the star `nearSpheres` source declare `fade: 'starCatalog'`.

The plan re-verifies each recession value against `focusRecession.ts` and each item list against today's fade rows before deleting them. Where an entry and today's rows disagree, today's behaviour wins unless "Behaviour changes" lists it.

### The body Layer

A minimal `src/layers/body/layer.ts` (`defineLayer` with `settings`, `visibility` and `ui` (the Orbit trails panel row) only) joins `APP_COMPOSITION` last, so its row is the last Layer row of Labels & guides; body render and load code stay in core. The prep PR creates it with `settings` only and moves the `orbitTrails` settings cluster from `src/state/settings/core/orbitTrails/` into `src/layers/body/state/` (use `npm run move-files`), so it leaves `CORE_SETTINGS_SLICES` and `CORE_SNAPSHOT_CLUSTERS` and is captured as a Layer cluster; the visibility PR adds `visibility` and `ui`. The star catalog's S-star trails (`guides().orbitTrails`) keep obeying this switch.

## Deleted

- The seven hand tables: `FadeId` (the union), `serializeFadeId`, `VISIBILITY_KEY_BY_KIND` / `_BY_LABEL_LAYER` (`fadeIdToVisibilityKey.ts`), `RECESSION_BY_KIND` / `RECESSION_BY_LABEL_LAYER`, `VisibilityLayerKey`, `VISIBILITY_LAYER_ROWS`, `VISIBILITY_ACTION_ROW`.
- `scopedVisibilityActions.ts`'s hand families and `LABEL_SLICES`; `labelHomeBySourceType.ts`'s hand rows (its read and write derive from label entries).
- Every Layer's `*FadeRows.ts` and core `FADE_LAYERS` rows; the `fades` Layer member and `fadeLayerRow`.
- Fade-row `guard`s; `installFadeOnArrival`'s open/closed snapshot (replaced by target recompute on gating-slot notifications); the guard short-circuit in `syncVisibilityFades`; the trap note in `createCosmicWebDensitySlot.ts:4-7`.
- The three rows nothing reads (`proceduralDisks`, `texturedDisks`, `scaleBar`), `OverlayId`, and `LabelLayerId`'s `'scaleBar'` if unused.
- The five `labelsAndGuides` row files (localBubble, constellations, lightTime, zoneOfAvoidance, missions), `selectMissionTrailsEnabled` and `setMissionTrailsEnabled` once their readers go, and `LayerSettingsRow` if nothing else uses it.
- Hand-built `FadeId`s and the off-and-faded check inside each label producer, including the structure label's ring gate (`produceStructureLabels.ts:103-111`).
- The hand ANDs of a section switch with an item switch: `deriveCosmicWebDensityLiveness.ts`, `visibleStars.ts`, `starSourcesInBand.ts` with `starSourceDrawOpacity.ts`, `starCatalogAssetRows.ts`'s demand, and `captionFadeRules.ts`'s `subjectVisible` axis (sun, famous star), with its `labelEnabled` axis.
- (prep) `ReadyFrameContext.positionedStars` (replaced by `nearSpheres`), and core's star reads in `frameContext.ts` (NEAR0's range input) and `sceneOccluderBodies.ts`. Core's star scene-set helpers leave core: `visibleStars`, `positionedVisibleStars`, `partitionStarsByResolution` (with `STAR_RESOLVE_PX`) and the `PositionedStar` type move into the star Layer (moved, not deleted).
- The galaxy LOD disks' raw fade read (`galaxyCatalog/frame.ts` `sourceOpacity`).
- (prep) `ReadyFrameContext.visibleSourceMask` and `FrameContextInput.visibleSourceMask`, and core's three `deriveSourceMasks` calls (`runFrame.ts`, `cubemapCaptureFrame.ts`, `pickFrameContext.ts`); `deriveSourceMasks` itself moves into the galaxy Layer as `sourceMaskOf` (moved, not deleted).
- `SourceMasks` (its `pick` mask retires with SQ2), and `GalaxyPointDrawSettings.visibleSourceMask` with the point renderer's mask skip (its exact-0 opacity skip is the same test once both read the handed value).
- The hand-authored Orbit trails row in `src/compositions/selectToggleRows.ts` (#888 moved row building out of `LabelsAndGuidesSectionContainer.tsx`).
- (prep) `CORE_SNAPSHOT_CLUSTERS`'s `orbitTrails`.
- (prep) `MissionsSettings.trails` (M1: the switch becomes the `missionTrails` cluster's `enabled`).
- (prep) Core's read of a Layer cluster in the scene-body captions: `produceSceneBodyCaptions.ts`'s `settings.missions.craft` emphasis over `SAMPLED_BODIES` moves into the missions Layer's own caption producer (M2).
- `sceneBodyLabels.ts`'s `SAMPLED_BODY_IDS` filter (M4; the prep PR's interim), replaced by the claimed-body rule.
- (prep) `SourceEntryBase.labelLayer` and `CategoryLabelLayer` (unread).
- Backlog: "A new Layer's fade row touches 6 hand-kept tables" and `docs/backlog/2026-08-20-fade-row-totality-question.md` (index lines and detail files).

## Uniformity

The user ruled for no special cases (2026-10-14: "make them work like everything else"). The branch delivers that only if all of the following hold. The final audit checks them:

- Every Layer declares through the same contracts: show and label entries in its `visibility.ts`, `label:` on its label producers, `fade:` on its passes, planners and `nearSpheres` source, `gates` on its asset rows, and `{ toggle, label }` for a Labels & guides row. If two Layers declare the same kind of thing in different shapes, that is a defect.
- No core code branches on a Layer id, show key, label name, source type or item id. The section rule, the liveness predicate (and the producer skip on it), `of`, recession and clip are each written once, for every entry.
- No file under `src/services/` or `src/state/` names a show key or label name as a visibility address. The exceptions are the body Layer's consumers that stay in core (`orbitTrailsPass`'s `fade: 'orbitTrails'`; the scene-body caption label, which lives in `src/data/labels/` and which the row and the claim lookup import; see "The body Layer").
- No core file reads a Layer's settings cluster or id list to shape that Layer's content: the star scene set, the galaxy mask and the Voyager caption emphasis live in their Layers (prep), and which bodies a Layer captions comes from its label entry's `items` (M4).
- No consumer multiplies in its own recession, clip or switch AND, or runs its own off-and-faded skip, on top of the value core hands it. A consumer may skip one of its own items whose handed value is 0.
- The only per-Layer differences are the data in the entries (`items`, `recession`, `of`, `cluster`) and behaviour changes 1–13 below.

## Behaviour changes

1. **Local Bubble eviction**: flying away now fades the shell out with its mesh, and flying back fades it in; today the fade stays at 1 and the mesh pops in on return.
2. **Galaxy label cue**: `show`/`hide` of the famous-galaxy label no longer writes `labelEnabled` on non-label-bearing catalogs. Nothing reads those bits.
3. **Black-hole captions**: `hide('label:body')` no longer hides the Galactic Centre caption (black holes have their own `label:blackHole`). The `'labels'` aggregate still hides both. No shipped clip addresses body captions directly.
4. **`'labels'` covers three more labels**: constellation names, zone-of-avoidance lettering and light-time captions become label entries, so `hide(['labels'])` hides them too (today they ignore it). The plan lists every shipped beat that hides `'labels'` while constellations, the zone of avoidance or light-time spheres stay shown.
5. **No focused-structure exemption** (SQ1): the focused structure's label and ring recede with their siblings. Every Layer now recedes the same way; a general "the focused subject never recedes" rule is a later PR.
6. **Picking follows pixels** (SQ2): one value gates both draw and pick in every pass, so a clip fade to 0 makes a thing unclickable. This retires the galaxy point pass's "pick follows intent" rule (`galaxyPointSpritesPass.ts:84-87`, `deriveSourceMasks.ts:25-27`, decision #18 D8). The same value builds the galaxy Layer's mask (V3), so under a clip at 0 the LOD disk walk, the hi-res famous planner and the structure member count drop the catalog too (today they keep it while its switch is on): a structure selected then shows no member count until the clip lifts. The one shipped clip that takes `survey` to 0 (`cosmicFlows.ts:86`) runs at a far zoom where no disk is drawn.
7. **Every cue honours its `over`** (SQ4): bare, scoped and label addresses share one write-then-sync path. The 14 grand-tour cues on a single item (e.g. `show(['survey:milliquas'], 6)`) fade over their written duration instead of the 600 ms / 100 ms defaults. If the plan's live-saga test confirms that the reactive sync pre-empts bare cues too (U5), they gain their `over` as well, and `over: 0` snaps instead of fading over 100 ms.
8. **Bare per-item cues flip the section switch** (SQ3), where the cluster has one: `hide(['cosmicWebDensity'])` writes `cosmicWebDensity.enabled` instead of every field's own switch. A cluster without a section switch (`galaxyCatalogs`, `structures`) keeps today's meaning: the bare address writes every item, so the tour's `hide(['survey'])` then one-at-a-time reveals are unchanged. The plan lists shipped cues that use a bare per-item key.
9. **Stars fade** (U2): toggling the Stars master or one star catalog fades the point stars and the Gaia field in and out over the default durations instead of popping, and the Gaia field fades in when its data arrives. The resolved star spheres fade too (V1): the Sun's sphere, a resolved famous star and the nearest-field-star sphere blend by their catalog's value instead of vanishing at the toggle (today the sphere pops off at once, since its set reads the switches). At value 1 the sphere draws exactly as today. The nearest-field-star sphere now obeys the Stars switches (today its gate reads only whether a catalog is loaded). The Sun and famous-star captions fade with their star (`of: 'starCatalog'`) instead of vanishing at the toggle.
10. **Structure labels fade with their ring** (U3): turning a category's rings off fades its labels out alongside them; today a label holds full opacity until its ring's fade reaches 0, then cuts. Under U7 a clip on `structureRing` also dims the labels: the one shipped clip that fades it, `cosmicFlows`' closing fade-to-black (`cosmicFlows.ts:96`), now takes any visible structure labels down with the rings.
11. **The Orbit trails checkbox moves** (U4): it becomes the body Layer's panel row, so it renders after the other Layer rows (composition order) instead of between the label categories and the Layer rows. Its id becomes `toggle-orbitTrails`.
12. **Galaxy LOD disks take the point pass's value** (U6): the disks dim under a clip on `survey` as the points do. The one shipped clip that fades `survey` (`cosmicFlows.ts:86`) runs at a far zoom where no disk is drawn, so nothing visible changes there. `survey` declares no recession, so focus recession does not touch them.
13. **The Voyager captions get their own label switch** (M2, M3): they follow `label:missions` on a new per-craft `missions.items.<craft>.labelEnabled` (default on, no panel row) instead of the Mesh bodies checkbox (`bodies.items['mesh-body'].labelEnabled`). Turning Mesh bodies off no longer hides them; `hide(['labels'])` still does, and `hide(['label:body'])` no longer does. The emphasis dim is unchanged. No shipped clip addresses body captions directly.

Also accepted, nothing visible: the Sun caption follows its own entry's clip address `label:starCatalog` (SQ5); the star label cue writes only the label-bearing catalogs (SQ6); panel rows are `{ slot: 'labelsAndGuides', content: { toggle, label } }` (SQ7); the unread `SourceEntryBase.labelLayer` field is deleted in its own commit (prep).

## Tests

Judged by `docs/superpowers/conventions/testing.md`. Each new test is mutation-checked.

- `target` (pure): switch × present truth table; an ungated entry is present; a per-item entry resolves per item.
- Gating: a gating slot's `committed()` turning non-null raises the target; `release()` lowers it (the Local Bubble case); a reload (`loading` over a committed value) keeps it.
- Label producer skip: off and faded out → not called; off and still fading → called with the falling value; on → called.
- `of` per item: label item X is off while show item X is off, and a sibling label item is untouched; an `of` label's value carries its `of` entry's clip. Every `of` pairing in `APP_VISIBILITY` obeys the item rule.
- Stars: the Gaia cut's source opacity is the crossfade times the handed value; star points scale their colour by their catalog's value; the field-star sphere is off while its catalog's value is 0; each sphere pass draws with its catalog's value as opacity; (prep) the sphere renderer writes that opacity into the uniform slot the shader reads (byte 76) and blends instead of replacing.
- Near spheres: core's frame provider admits a source's sphere only while the item is live for the entry the source names.
- Galaxy mask: a catalog's bit is set exactly while its handed value is above 0; the planner's walk hides a catalog whose handed value is 0 while the registry still holds 1.
- `setVisibility`: scalar write; item write that leaves the item's other fields intact.
- (prep) Black holes: the initial `blackHoles.items` has a row for every black-hole id (derived, so a new hole cannot be missing), and the reducer writes the field.
- (prep) Voyager captions: each present sampled craft is captioned by exactly one producer; the emphasis dim holds in the missions Layer's producer.
- Claimed body captions (M4): over the composed entries, core captions no claimed body and the claimant captions each once, while Earth keeps its core caption (its id is also an item of core's own entry).
- (prep) Galaxy pick split: until SQ2 lands, `drawPick` drops a catalog switched off while its fade-out runs.
- Address vocabulary: every address in `APP_VISIBILITY` is declared once (the type cannot catch two Layers declaring the same key); `'labels'` expands to every label address.
- Type-level: `@ts-expect-error` on a misspelled key, a scoped item that does not exist, and a nested label item that does not exist.
- Existing behaviour tests that pinned table contents (`fadeLayers.test.ts`, `wireSlots.test.ts`, `makeFadeBridgeState.ts`, `visibilityCuesWriteCapturedClusters.test.ts`, label-order tests) are rewritten against derived data or deleted when they only restated a table.

## Ground preparation

The visibility work is itself ground preparation for the heliosphere shell Layer. The one Layer that broke the uniform "no data = nothing committed" rule, the galaxy catalog, was aligned in its own PR (#892, merged `7d93f2da6`).

Its own prep is a separate PR that lands first (SPLIT), every item behaviour-neutral, gated by a pixel-identical before/after: `docs/superpowers/plans/2026-10-15-layer-visibility-ground.md`. Each item reads today's switches and fades; none introduces a visibility type.

- Delete the unread `SourceEntryBase.labelLayer` (adjacent ruling).
- Complete `blackHoles.items`: derived `initialState`, a field-writing reducer.
- `src/layers/body/layer.ts` with `settings` only, last in `APP_COMPOSITION`; the `orbitTrails` cluster moves into the body Layer.
- M1: split `missionTrails: { enabled }` out of `missions` (which keeps `craft` and `speed`), re-pointing every reader and writer, the Voyager exhibit's settings and the website's settings row.
- M2: the Voyager captions move from core's `produceSceneBodyCaptions` into a missions Layer caption producer, with the emphasis dim inside it; `captionComposeContextOf` is shared by the NEAR0 caption producers. Core's `sceneBodyLabels` skips the craft by a `SAMPLED_BODY_IDS` filter until the visibility PR replaces it with the claimed-body rule (M4).
- V2: core's star scene-set helpers move into the star Layer behind the generic `Layer.nearSpheres` member; the source reads today's switches through a `settings` input, which the visibility PR replaces with core's `live`.
- V3: `deriveSourceMasks` → `src/layers/galaxyCatalog/present/sourceMaskOf.ts`; `visibleSourceMask` leaves core's frame context; the Layer computes both masks itself, so today's draw/pick split holds until SQ2.
- V1: `TintedSphereUniforms.opacity` at byte 76 and a straight-alpha OVER sphere pipeline, at a fixed opacity of 1.

## Out of scope

- Panels with richer UI (galaxy catalogs, stars, structures): they keep their own setters.
- Moving body render/load code into the body Layer.
- Layer-owned scale fade bands (`docs/backlog/2026-09-19-layer-owned-scale-fade-bands.md`): distance bands, a different concern.
- The heliosphere Layer itself (the feature PR).
