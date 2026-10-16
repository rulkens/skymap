# Layer-declared visibility: implementation plan

**Starts after PR 1 merged.** PR 1 is the ground prep, `docs/superpowers/plans/2026-10-15-layer-visibility-ground.md`. Branch this PR from `main` once PR 1 has landed; nothing here runs against a tree without it.

**Goal:** each Layer declares what it can show and label as static `visibility` data; the seven hand tables about fades, cues, recession, label switches and panel toggles are derived from it or deleted, and a new toggleable fading Layer edits no core file beyond the composition lists. Every Layer goes through the same contracts: no Layer gets a special case (spec "Uniformity").

**Architecture:** per-Layer `visibility.ts` tuples → `APP_VISIBILITY` in `src/compositions/` → derived address types. At runtime core composes the same entries off `deps.composition.layers` into `state.visibilityEntries`. One flow: `target(address, item) = switch && present && (of's target for the same item, for a label that declares one)`. The switch follows one data-driven section rule for every per-item show entry; present is the gating slot's `committed() !== null`. The target is recomputed on every settings write and every gating-slot notification; the fade registry animates toward it; core multiplies recession × clip once (an `of` label also × its `of` entry's clip) and hands passes, planners and label producers a plain number (or `Record<item, number>`). One root write (`setVisibility`) and one cue path (write, then sync with the cue's `over`). The old bridges run beside the new one until every Layer has migrated, then go.

**Spec:** `docs/superpowers/specs/2026-10-13-layer-declared-visibility-design.md` (rationale: `docs/grill-sessions/layer-declared-fades-2026-10-13.md`; rulings after the spec, including U1–U7, V1–V3, SPLIT, M1–M4, the 2026-10-15 REVERT of V2 and T7-1–T7-4: `.superpowers/grill/2026-10-13-layer-declared-fades-rulings.md`).

**Not in this PR: bodies move out of core into Layers** (ruled 2026-10-15). Each Layer will contribute its body rows as data, like `Layer.slabs`: planets and moons, missions, mesh bodies, stars. That is the LAST Layer refactor PR, after this one. Task 7 is an interim step shaped not to block it: core sorts one roster of scene bodies, no core table names a Layer key, and each body carries its own data. Also out of scope, unruled side findings: mesh picking uses the bounding sphere (imprecise), and captions are never occluded by mesh bodies.

**Built on PR 1.** These exist when this PR starts, still on today's fade reads; the tasks below switch them to handed values:
- `src/layers/body/layer.ts` (settings only), last in `APP_COMPOSITION`, holding the `orbitTrails` cluster.
- The missions Layer's `missionTrails: { enabled }` cluster (M1) and its Voyager caption producer `produceMissionCaptions` (M2), with the emphasis dim inside it; `captionComposeContextOf`, shared by every NEAR0 caption producer; `SAMPLED_BODY_IDS` (`src/data/missions/sampledBodyIds.ts`, a `readonly string[]`), which core's `sceneBodyLabels.ts` still filters on until Task 10 (M4).
- Core still holds its star scene-set helpers, as on `main` (V2 was reverted from PR 1): `visibleStars`, `positionedVisibleStars`, `partitionStarsByResolution` (with `STAR_RESOLVE_PX`) under `src/services/engine/frame/`, `PositionedStar`, and `ReadyFrameContext.positionedStars`. Task 7 replaces them with one sort over every scene body, the stars included, and deletes the separate star partition.
- `src/layers/galaxyCatalog/present/sourceMaskOf.ts` (V3), still `(state, nowMs) → { draw, pick }`; no core file derives a galaxy mask.
- `TintedSphereUniforms.opacity` at byte 76 and a straight-alpha OVER sphere pipeline (V1); both sphere passes draw at opacity 1.
- `blackHoles.items` complete; `SourceEntryBase.labelLayer` deleted.

Line citations below are at `7ab7ec0fd`; in files PR 1 touched they may have moved by a few lines.

## Global Constraints

- **No special cases, ever silently.** If a Layer seems to need a special case, or a declaration unlike its siblings (a different entry shape, an extra skip, its own recession, clip or switch AND, a core branch on its id), STOP and report it in your reply. Never add it silently. The same applies to anything a task's text did not foresee.
- **No Layer contract change beyond this plan's** (ruled 2026-10-15). The plan adds exactly: `Layer.visibility` (Task 1), `ContentPass.fade` and `FrameContentPlanner.fade` with their trailing value parameter (Tasks 1, 4), `LayerScreenLabel.label`, `LayerWorldLabel` (typing `LayerGuides.worldLabels`) and `produceLabels`' third argument (Task 1), `AssetWiringRow.gates` (Task 3), `LayerUiSlots.labelsAndGuides: LayerToggleRow` (Task 6), the optional show-entry field `ShowEntry.bodies` (Task 7, T7-1), `ReadyFrameContext.sceneBodies` in place of `ReadyFrameContext.positionedStars` (Task 7, T7-3: a consented core frame change, a data field, not a function), and removes `Layer.fades` (Task 12). A task that seems to need any other new or widened member of `Layer`, `LayerInstance`, `ContentPass`, `FrameContentPlanner`, a label row, `LayerUiSlots` or `ReadyFrameContext` STOPs and reports: it needs the user's consent.
- Never add `Co-Authored-By` (or any attribution trailer) to a commit. One commit per task, message in the plan's voice. Never rebase, force-push or merge.
- Stage by path, never `git add -A`. `npx prettier --write <files you touched>`, never `npm run format`.
- Move or rename TS files only with `npm run move-files -- <from> <to>` (run `--dry` first), never `git mv` plus hand-edited imports. Afterwards grep for the old path, because string literals and `vi.mock` paths are not rewritten.
- Files in `src/services/engine/frame/` (incl. `passes/`) export only their one symbol (ratchet: `tests/services/engine/frame/frameFilePurity.test.ts`). Pass and orchestration files declare only their one export.
- One symbol per file in every `utils/` and `@types/` folder; filename = symbol; deep relative imports, no barrels; `type`, never `interface`; types never inline in implementation files.
- Comments explain why, never what. Module header ≤ 10 lines; comment lines ≤ half the code lines. Rewrite or delete every comment that names a deleted symbol (`FadeId`, `installFadeOnArrival`, `syncVisibilityFades`, `VisibilityLayerKey`, `resolveLayerOpacity`, `subjectVisible`, …).
- No task edits a `.wesl` file: PR 1 built the sphere opacity slot. A task that finds it needs one STOPs and reports.
- **Never read `APP_COMPOSITION` for a visibility type.** Every derived type comes from `APP_VISIBILITY`, which imports each Layer's own `visibility.ts`. A `visibility.ts` imports data only: never its `layer.ts`, a pass, or anything typed with `Layer`/`ContentPass`. This avoids the circular alias described at `src/layers/galaxyCatalog/state/slices.ts:1-7`, which `tsc` refuses and tsgo does not see.
- Verify with `npm run typecheck:fast` plus the targeted tests. **Tasks 1, 4, 7 and 12 must also pass `npx tsc --noEmit`** (tsgo misses the cycle).
- Before editing `src/compositions/selectToggleRows.ts` or `LabelsAndGuidesSectionContainer.tsx`, read `docs/superpowers/conventions/ui-ux.md` and `.claude/skills/create-component/SKILL.md`. The section must look and read the same as before, except that the Orbit trails row moves to the end (behaviour change #11).
- Recession strengths keep `STRONG_RECESSION = 0.15` and `MILD_RECESSION = 0.25` (`focusRecession.ts:23-24`).
- The section rule, the liveness predicate (and the producer skip on it), `of`, recession and clip are each written once, in core. A consumer receives a value and uses it. A consumer may skip one of its own items whose handed value is 0; it never reads a switch or a raw fade to decide.

## Review Focus

The likeliest failure modes CI would not see unless a test pins them:

1. **Uniformity across Layers.** A migrated Layer that declares the same kind of thing in a different shape, a consumer that keeps its own recession, clip, switch AND or off-and-faded skip, or core code that branches on a Layer id, show key, label name, source type or item id. No single test pins this. The final review's mandate below is the check, and it runs against the spec's "Uniformity" section by name.
2. **A gating notification retargets sibling items.** Galaxy catalog A's commit must fade in A only. A whole-entry recompute restarts B's in-flight tier-swap ramp, which is the regression `syncVisibilityFades.ts:82-88` exists for. Pinned in Task 3 by `a gating commit retargets only its own item`.
3. **The producer skip reads the handed value instead of the raw fade.** A clip `fade(…, 0)` on a label that is switched off but still fading would then cut its fade-out tail short (`produceMilkyWayLabel.ts:46-53`). Pinned in Task 4 by `off with raw fade > 0 and clip 0 → still called`.
4. **Recession or clip applied twice.** A migrated consumer that keeps its own `focusRecession`/`clipOpacityOf` multiply on top of a handed value would recede to 0.0625 instead of 0.25. Pinned in Task 10 (`composeForegroundCaption recedes once`) and by the existing `produceStarCaptions.test.ts:126`, `produceFamousGalaxyLabels.test.ts:356`, `produceStructureLabels.test.ts:247` and `produceStructureMarkers.test.ts:193-195` assertions, which must stay.
5. **`setVisibility` replaces an item instead of writing a field.** This is the pattern PR 1 fixed in `setBlackHoleLabelEnabled`. Pinned in Task 2 by `an item write leaves the item's other fields intact`.
6. **`APP_VISIBILITY` drifts from the composition.** A Layer that is composed but missing from `APP_VISIBILITY` would escape `hide(['labels'])` silently, because the expansion reads `APP_VISIBILITY` while the engine reads the composition. Pinned in Task 1 by `APP_VISIBILITY lists exactly the entries the composed Layers declare`.
7. **An `of` label misses its thing's cue.** `show(['constellations'], 3)` must ramp the names over the same 3 s as the lines. A sync narrowed to `only: ['constellations']` that skips `label:constellations` leaves the names on the reactive default. Pinned in Task 3 by `only also covers the label entries whose of names it`.
8. **A per-item `of` resolves against the wrong item.** Structure label `void` must follow ring `void`, not "any ring on" or the item-less entry. Pinned in Task 3 by `a per-item of label follows its own item`. A label item its `of` entry lacks fails Task 1's `every of pairing obeys the item rule`.
9. **A star consumer keeps reading settings.** The star passes, the cut and the field-star sphere each had their own switch read; one left behind keeps popping. Pinned in Task 8 by the star tests.
10. **The reactive sync pre-empts the cue's `over`.** Finding by reading the code: `watchFadesSaga` runs synchronously inside `dispatch`. The clip tick dispatches from the frame loop, outside any saga task, so redux-saga 1.5's `asap` runs the `takeEvery` worker at once (`@redux-saga/core` `stdChannel.put` → `asap` → `immediately(fork)`). Its `syncFades()` issues `fadeTo` with the default 600 ms / 100 ms before `applySceneEffect`'s explicit sync runs (`applySceneEffect.ts:33-47`). The explicit sync then finds the target already held (`syncVisibilityFades.ts:35`) and drops the cue's duration. If this reading is right, bare cues ignore `over` today too, and `over: 0` fades over 100 ms instead of snapping. Task 11's first test decides it; the fix for the failing case is ruled (U5) and is in that task.
11. **A scene body admitted on the wrong test.** Core admits a body into `ReadyFrameContext.sceneBodies` while every identity covering it (from the show entries' `bodies`) has a handed value above 0 (T7-4); a body no entry covers is always admitted. Testing liveness (held target or raw fade) instead would keep a star clipped to 0 occluding trails and sizing NEAR0; admitting every body would keep a hidden Sun there; treating an uncovered body as not admitted would drop every planet. The producer skip keeps testing liveness (Review Focus #3): the two rules differ by ruling, so do not merge them. Pinned in Task 7 by `a covered body is admitted only while every covering item's handed value is above 0` and `a star faded to 0 neither sizes NEAR0 nor occludes`.
12. **A sphere pass keeps drawing at opacity 1.** PR 1 left both sphere passes handing `1`; one left behind pops instead of fading. Pinned in Task 8 by `a sphere draws with its catalog's handed value` (both passes).
13. **A claimed body captioned twice, or not at all** (M4). The claim set counting core's own `label:body` entry would drop Earth's caption (`'earth'` is both a body id and that entry's item); a missing claim captions a craft in core and in its Layer. Pinned in Task 10 by `each claimed body is captioned once, by its claimant`.
14. **Each body keeps its own resolve size.** One sort over planets, craft and stars must still resolve a planet or craft at 3 px (`BODY_GLINT_MAX_PX`, the `bodyGlint` fade band's `goneAt`) and a star at 4 px (`STAR_RESOLVE_PX`). The size is data on each body's seed record (`resolvePx`, T7-2); a shared constant in the sort moves one handoff by a pixel. Pinned in Task 7 by `each body resolves at its own size`.

### Final review mandate

The one whole-branch review at the end, and every `review: yes` mid-branch review (there scoped to the diff so far; Layers not yet migrated read "old path"), does all of the following. The reviewer reports findings against the spec's **"Uniformity"** section by name, one invariant at a time, alongside the table:

- **(a) A cross-Layer table.** One row per Layer: localBubble, constellations, cosmicWebFilaments, flow, lightTime, zoneOfAvoidance, missions, milkyWay, cosmicWebDensity, galaxyCatalog, structure, starCatalog, blackHoles, body, and heliosphere-ready (none: the feature PR adds it, so its row checks that a new Layer would need no core edit). Columns: show entries; label entries (with `of`, and any body ids their `items` claim from core's captions); the label producers' `label:`; the passes' and planners' `fade`; the show entries' `bodies` (starCatalog: `SEEDED_STAR_CATALOGS`; every other Layer: none, its bodies, if any, still in core); the asset rows' `gates`; panel rows; and any consumer still doing its own recession, clip, skip or switch AND. Every row or cell that differs from its siblings is a finding unless the spec's "Behaviour changes" names it or it appears in (e) below.
- **(b) Core branches.** Any core code that branches on a Layer id, show key, label name, source type or item id is a finding.
- **(c) The `entanglement-radar` skill** over the branch diff.
- **(d) Leftover greps** in migrated Layers and core: hand-rolled off-and-faded skips like `produceMilkyWayLabel.ts:46-53` (`labelEnabled && … === 0`, `enabled || opacity > 0`); their own `focusRecession(`, `clipOpacityOf(`, `fades.opacityOf(` and `resolveLayerOpacity(` calls; `settings.<cluster>.enabled &&` ANDs; `subjectVisible`. Plus the core-address grep (spec "Uniformity", fourth invariant), run from the worktree root:
  ```bash
  grep -rnE "(address|fade|toggle|gates|of): '|'label:|label: '(constellations|lightTime|zoneOfAvoidance|milkyWay|famousGalaxy|structure|starCatalog|blackHole|body|missions)'" src/services src/state
  ```
  The only allowed hit is `orbitTrailsPass.ts`'s `fade: 'orbitTrails'` (a body Layer consumer that stays in core). No core file holds a star identity: core learns which bodies the star entry covers from its `bodies` (Task 7). The scene-body caption label lives in `src/data/labels/sceneBodyCaptionLabel.ts` (Task 10), outside the grep, so `engine.ts`'s row and the claim lookup import it rather than repeat it. Any other hit in code is a finding; a comment that quotes an address as an example is not. Bare quoted keys are not grepped: `'body'`, `'starCatalog'`, `'structure'` and `'survey'` are also selection kinds and source types all over core.
- **(e) Known leftovers, recorded and not chased.** Each appears in the table marked "leftover"; anything else that differs is a finding.
  - Asset `demand` predicates are load policy, not visibility: each keeps today's meaning. The star row's demand calls `visibilitySwitchOf` (U2: its hand AND goes); the density rows keep reading the item switch alone (they prefetch while the section is off).
  - The structure bulk `.ccat` and the famous-star meta sidecar gate nothing (spec "Gating").
  - The famous catalog's exemption from the deep-zoom survey band (`galaxyPointSpritesPass.ts:72-80`): a scale band, not visibility (the Layer-owned scale fade bands backlog item).
  - `localBubblePass`'s `hasMesh()` and `flowFieldPass`'s `slotReady` checks: renderer null-safety, not fade logic.
  - `missionTrailsPass`'s `FOREGROUND_MAX_DISTANCE_MPC` cut, `spacecraftPresent` and missing-track checks (the same cut `orbitTrailsPass` keeps; presence over sim time, and null-safety), and the `emphasisDim` in both `missionTrailsPass` and `produceMissionCaptions` (the selected craft's emphasis: appearance, not visibility).

## Dispatch groups

Four grouped dispatches, one commit per task, one whole-branch review at the end (the mandate above), CI as the gate.

| Group | Tasks | Theme | Model |
|---|---|---|---|
| A | 1, 2, 3, 4 | Contracts and entries; `setVisibility` and the section rule; the target, gating and per-item `of`; the resolver, liveness and core gates | Opus (`review: yes` inside) |
| B | 5, 6, 7, 8 | Single-toggle Layers (missions included) with their new label entries; panel rows (Mission trails and Orbit trails included); one sort over every scene body, the stars included (REVERT, T7-1–T7-4), the star show entry (U2), the spheres take the handed value (V1) | Opus (`review: yes` on 7) |
| C | 9, 10 | Per-item cosmic Layers (SQ1, SQ2, SQ3, U3, U6), the galaxy mask on the handed value (V3); near-field captions (SQ5, SQ6, U2's captions, the missions captions and the claimed-body rule, M3, M4) | Sonnet |
| D | 11, 12 | One cue path over the derived vocabulary (SQ4, U5); delete the old tables | Opus (`review: yes` inside) |

Group B runs on Opus because Task 7 changes `ReadyFrameContext`, re-routes NEAR0's painter range and the scene occluders, and makes core's frame context resolve handed values. Task 7 carries one named leftover (`near0SphereBodies`, T7-5) that the bodies-into-Layers PR deletes. Tasks 5 and 6 are light; the group stays one dispatch because 7 and 8 share the star files and 5–6 are mechanical.

---

## Group A: foundations

### Task 1: Entry types, per-Layer `visibility.ts`, `APP_VISIBILITY` and derived addresses

**review: yes**: a type cycle is the bug class here, and the `tsc` gate is the check.

**Files:**
- create `src/@types/engine/layer/VisibilityEntry.d.ts`, `VisibilityEntryCommon.d.ts`, `ShowEntry.d.ts`, `LabelEntry.d.ts`
- create `src/@types/animation/ShowKey.d.ts`, `LabelName.d.ts`, `LabelAddress.d.ts`, `VisibilityAddress.d.ts`, `ScopedVisibilityAddress.d.ts`, `VisibilityArg.d.ts`, `FadeIdentity.d.ts`, `FadeValueOf.d.ts` (plus one file per helper type the plumbing needs, e.g. `ShowItemOf.d.ts`, `LabelItemOf.d.ts`)
- create `src/layers/{localBubble,constellations,cosmicWebFilaments,flow,lightTime,zoneOfAvoidance,missions,cosmicWebDensity,milkyWay,galaxyCatalog,structure,starCatalog,blackHoles,body}/visibility.ts`
- create `src/compositions/appVisibility.ts`
- modify `src/@types/engine/layer/Layer.d.ts` (`visibility?`), every `src/layers/*/layer.ts` (declare `visibility`; `src/layers/body/layer.ts` exists since PR 1)
- modify `src/@types/settings/{ConstellationsSettings,LightTimeSettings,ZoneOfAvoidanceSettings}.d.ts` and the three `initialState.ts` under `src/layers/{constellations,lightTime,zoneOfAvoidance}/state/*/` (new `labelEnabled: true`); create `src/@types/settings/MissionCraftSettings.d.ts`, modify `src/@types/settings/MissionsSettings.d.ts` and `src/layers/missions/state/missions/initialState.ts` (new `items`, M3, below); `tests/packages/website/docsReference.test.ts` (`NOT_IN_PANEL` gains `/^(constellations|lightTime|zoneOfAvoidance)\.labelEnabled$/` and `/^missions\.items\.[\w-]+\.labelEnabled$/`: no panel row changes them)
- modify `src/@types/engine/frame/ContentPass.d.ts`, `src/@types/engine/frame/FrameContentPlanner.d.ts`, `src/@types/engine/layer/LayerScreenLabel.d.ts`, create `src/@types/engine/layer/LayerWorldLabel.d.ts`, modify `LayerGuides.d.ts` (types only, no consumer yet)
- create `tests/compositions/appVisibility.test.ts`

**Contract:**

```ts
// VisibilityEntryCommon.d.ts
export type VisibilityEntryCommon = {
  readonly cluster?: string;              // settings cluster; defaults to `key` (show) / required for labels
  readonly items?: readonly string[];      // per item: settings[cluster].items[id].<field>
  readonly recession?: 'strong' | 'mild';  // omitted = does not recede
};
export type ShowEntry = VisibilityEntryCommon & { readonly key: string; readonly field?: 'enabled' };
export type LabelEntry = VisibilityEntryCommon & {
  readonly label: string;   // field is labelEnabled
  readonly cluster: string;
  readonly of?: string;     // a ShowKey; typed `string` because `ShowKey` derives from the entries (circular)
};
export type VisibilityEntry = ShowEntry | LabelEntry;

// appVisibility.ts: each spread imported from that Layer's own visibility.ts
export const APP_VISIBILITY = [...] as const;
// plus a compile-time check that every `of` is a ShowKey: a misspelled `of` must fail `tsc`.

// derived (one file each)
ShowKey            = Extract<Entries, { key: string }>['key']
LabelName          = Extract<Entries, { label: string }>['label']
LabelAddress       = `label:${LabelName}`
VisibilityAddress  = ShowKey | LabelAddress
ScopedVisibilityAddress = `${K}:${ShowItemOf<K>}` (K = show keys with items) | `label:${L}:${LabelItemOf<L>}` (L = labels with items)
VisibilityArg      = VisibilityAddress | 'labels'
FadeIdentity       = { readonly address: VisibilityAddress; readonly item?: string }
FadeValueOf<A>     = entry of A has items ? Readonly<Record<item, number>> : number

// ContentPass and FrameContentPlanner gain (types only in this task):
readonly fade?: ShowKey;
// ContentPass: enabled / draw / pickEnabled / drawPick gain a trailing `fade` parameter typed FadeValueOf<that key>.
// FrameContentPlanner: `plan` gains the same trailing parameter (both scopes).
// Pick an encoding (e.g. ContentPass<K extends ShowKey = never>) such that a pass declaring
// fade: 'localBubble' receives `number` with no cast, and `readonly ContentPass[]` still accepts it.

// LayerScreenLabel = Label2DProducer & { slab; label?: LabelName }; produceLabels gains a third
// parameter typed by the referenced entry. LayerWorldLabel is the same over Label3DProducer.
// There is no `fade:` form on a label row.
```

**Entries.** Verified against `focusRecession.ts:27-62` and today's fade rows (at `7ab7ec0fd`); every recession value matches. Build item lists the way the fade rows do today. A single-parameter `.filter((e) => e.bearsLabel)` narrows by the inferred predicate (`starCatalogFadeRows.ts:12-19`, `fadeLayers.ts:18-22`).

| Layer | Entries |
|---|---|
| localBubble | `{ key: 'localBubble', recession: 'strong' }` |
| constellations | `{ key: 'constellations', recession: 'strong' }`, `{ label: 'constellations', cluster: 'constellations', of: 'constellations', recession: 'strong' }` |
| cosmicWebFilaments | `{ key: 'cosmicWebFilaments', recession: 'strong' }` |
| flow | `{ key: 'flow' }` |
| lightTime | `{ key: 'lightTime' }`, `{ label: 'lightTime', cluster: 'lightTime', of: 'lightTime' }` |
| zoneOfAvoidance | `{ key: 'zoneOfAvoidance' }`, `{ label: 'zoneOfAvoidance', cluster: 'zoneOfAvoidance', of: 'zoneOfAvoidance' }` |
| missions | `{ key: 'missionTrails', cluster: 'missionTrails' }` (no recession: `missionTrails: undefined` today; the switch is PR 1's `missionTrails.enabled`), `{ label: 'missions', cluster: 'missions', items: SAMPLED_BODY_IDS, recession: 'mild' }` (PR 1's `produceMissionCaptions`; no `of`: the Voyager captions are independent of the trails today, like the body captions they were; `mild` is their recession today; per-craft switch, M3 below; the `items` also claim the craft from core's body captions, M4, Task 10) |
| cosmicWebDensity | `{ key: 'cosmicWebDensity', items: <ids of COSMIC_WEB_DENSITY_SOURCE_ROWS>, recession: 'strong' }` (one entry: today's master recession times an unreceded field equals the field receding strongly; there is no `cosmicWebDensityField` key) |
| milkyWay | `{ key: 'milkyWayDisk', cluster: 'milkyWay', recession: 'strong' }`, `{ label: 'milkyWay', cluster: 'milkyWay' }` |
| galaxyCatalog | `{ key: 'survey', cluster: 'galaxyCatalogs', items: GALAXY_CATALOG_IDS }`, `{ label: 'famousGalaxy', cluster: 'galaxyCatalogs', items: <galaxy-catalog entries with bearsLabel> (= ['famousGalaxy']), recession: 'mild' }` |
| structure | `{ key: 'structureRing', cluster: 'structures', items: STRUCTURE_IDS, recession: 'mild' }`, `{ label: 'structure', cluster: 'structures', items: STRUCTURE_IDS, of: 'structureRing', recession: 'mild' }` |
| starCatalog | `{ key: 'starCatalog', cluster: 'starCatalogs', items: STAR_CATALOG_IDS }` (no recession: the star layers have no fade row today; Task 7 adds `bodies: SEEDED_STAR_CATALOGS`), `{ label: 'starCatalog', cluster: 'starCatalogs', items: <label-bearing star catalogs> (= sun, famousStar), of: 'starCatalog', recession: 'mild' }` |
| blackHoles | `{ label: 'blackHole', cluster: 'blackHoles', items: <ids of BLACK_HOLE_SOURCE_ROWS>, recession: 'mild' }` |
| body | `{ key: 'orbitTrails' }`, `{ label: 'body', cluster: 'bodies', items: <SOURCE_ENTRIES type 'body' with bearsLabel> (= earth, planet, mesh-body), recession: 'mild' }` |

**The `of` item rule** (spec "Consumers", `of`): an item-less label names an item-less show entry; a per-item label names a per-item show entry that has every one of the label's items, and label item X follows show item X. Today's five `of` entries: three item-less (constellations, lightTime, zoneOfAvoidance), structure (same items as its ring), star (`sun`, `famousStar` ⊂ the star show items). Any other pairing is an error at test time; there is no fallback.

**The Voyager captions' switch (M3, ruled).** Today they follow the Mesh bodies label checkbox (`bodies.items['mesh-body'].labelEnabled`, through the `meshBody` caption rule). `label:missions` reads its own cluster instead. Because the entry is per craft (its `items` are what M4's claim needs), the switch takes the shape its per-item siblings use (`blackHoles.items[id].labelEnabled`, `bodies.items[id].labelEnabled`): `MissionsSettings` gains `readonly items: Readonly<Record<string, MissionCraftSettings>>` with `MissionCraftSettings = { labelEnabled: boolean }`, and `initialState.items` is derived from `SAMPLED_BODY_IDS` (every craft `{ labelEnabled: true }`), as PR 1 derived the black-hole record. No setter and no panel row. The Mesh bodies checkbox stops hiding the Voyager names; `hide(['labels'])` still hides them (behaviour change #13). The Voyager exhibit spreads `missionsInitialState` (`voyagerMissions.ts:52`), so it picks up `items` unchanged. `missions` is a Layer cluster that `captureSettings.ts` captures whole, so tour and exhibit snapshots carry `items` with no edit (Task 11's `every entry's cluster is captured by the tour snapshot` covers it).

Each file exports `<layer>Visibility = [...] as const satisfies readonly VisibilityEntry[]`. The body Layer's `layer.ts` (PR 1) gains `visibility: bodyVisibility`; Task 6 adds its `ui` row.

- [ ] Write the four entry types and the derived address types. Pin the generic plumbing (`ShowItemOf`, `LabelItemOf`, `FadeValueOf`) so the `@ts-expect-error` lines below hold.
- [ ] Add `labelEnabled: boolean` (default `true`) to the constellations, lightTime and zoneOfAvoidance clusters, `missions.items` (above), and the two `NOT_IN_PANEL` patterns. No setter and no panel row: cues and `setVisibility` reach them.
- [ ] Write the 14 `visibility.ts` files and `APP_VISIBILITY`. Declare `visibility` on every `defineLayer` call, the body Layer's included.
- [ ] Add the types-only fields to `ContentPass`, `FrameContentPlanner`, `LayerScreenLabel`, `LayerWorldLabel` and `LayerGuides.worldLabels`.
- [ ] Test `every address in APP_VISIBILITY is declared once`: show keys and label names unique; no show key equal to `label` or `labels` (an item suffix must never collide with a label address); items unique within an entry.
- [ ] Test `every of pairing obeys the item rule`: every `of` names a show entry; item-less labels name item-less entries; every item of a per-item `of` label is an item of its `of` entry. Mutation-check by adding a bogus item to the structure label's list (or pointing the star label's `of` at an item-less key): the test must fail.
- [ ] Test `APP_VISIBILITY lists exactly the entries the composed Layers declare` against `APP_COMPOSITION.layers.flatMap((l) => l.visibility ?? [])` (precedent: `tests/compositions/sourceRegistryCoverage.test.ts`).
- [ ] Type-level lines in the same file: `// @ts-expect-error` on `const a: VisibilityArg = 'flwo'`, `const b: ScopedVisibilityAddress = 'survey:bogus'`, `const c: ScopedVisibilityAddress = 'label:structure:bogus'`, plus one non-error line each for `'label:structure:void'`, `'survey:milliquas'`, `'cosmicWebDensity:mcpm'` and `'starCatalog:sun'`.
- [ ] **Gate:** `npx tsc --noEmit` passes. This proves `ContentPass` (→ `PassState` → the settings root) can reference `ShowKey`. If `tsc` reports a circular alias, find the `visibility.ts` import chain that reaches a Layer-typed module and cut it. Do not reach for `APP_COMPOSITION`.
- [ ] Commit.

### Task 2: `setVisibility` and the switch reader with the section rule

**review: yes**: Redux state.

**Files:** create `src/state/settings/setVisibilityAction.ts`, `src/state/settings/writeVisibilitySwitch.ts`, `src/utils/visibility/hasSectionSwitch.ts`, `src/utils/visibility/visibilitySwitchOf.ts`, `src/utils/visibility/visibilityAddressOf.ts`; modify `src/state/settings/settingsReducer.ts`; tests `tests/state/settings/settingsReducer.test.ts`, create `tests/utils/visibility/visibilitySwitchOf.test.ts`.

**Contract:**

```ts
export const setVisibility = createAction<{
  cluster: string; item?: string; field: 'enabled' | 'labelEnabled'; on: boolean;
}>('settings/setVisibility');   // Task 11 may add `overMs?` (U5); the reducer never reads it
// settingsReducer: after the combine, beside mergeSnapshot (settingsReducer.ts:18-19).
writeVisibilitySwitch(settings: EngineSettingsState, p: SetVisibilityPayload): EngineSettingsState
  // writes settings[cluster][field] or settings[cluster].items[item][field]; returns a new
  // object (no in-place mutation); throws on a missing cluster or item (records are complete).
hasSectionSwitch(settings: EngineSettingsState, cluster: string): boolean
  // typeof settings[cluster].enabled === 'boolean'. The one place the section rule's premise is read.
visibilitySwitchOf(settings: EngineSettingsState, entry: VisibilityEntry, item?: string): boolean
  // item-less entry:            settings[cluster][field]
  // per-item SHOW entry:        (hasSectionSwitch ? settings[cluster].enabled : true) && settings[cluster].items[item].enabled
  // per-item LABEL entry:       settings[cluster].items[item].labelEnabled   (a label reaches its section through `of`)
visibilityAddressOf(entry: VisibilityEntry): VisibilityAddress   // key, or `label:${label}`
```

The section rule lives in `visibilitySwitchOf` and nowhere else: no consumer ANDs a section switch with an item switch. It is data-driven (U1): it binds `cosmicWebDensity` and `starCatalogs`, the two clusters with a boolean `enabled`; `galaxyCatalogs` and `structures` resolve on the item alone. It replaces the hand ANDs at `deriveCosmicWebDensityLiveness.ts:21-36` (Task 9) and in the star catalog (Task 8).

The `settings/` action type prefix is what makes `watchFadesSaga` (`watchFadesSaga.ts:17-18`) react to it; do not rename it. Every item record is complete (PR 1 completed `blackHoles.items`), so `setVisibility` never creates an item.

- [ ] Test `setVisibility writes a scalar switch` (e.g. `{ cluster: 'flow', field: 'enabled', on: false }` → `settings.flow.enabled === false`, sibling fields unchanged).
- [ ] Test `an item write leaves the item's other fields intact`: write `galaxyCatalogs.items.sdss.enabled = false` and assert `labelEnabled` keeps its prior value. Mutation-check by making the writer replace the item.
- [ ] Test `a per-item show switch is off when its section switch is off`: `starCatalogs.enabled = false` with `items.famousStar.enabled = true` → `false` (same for `cosmicWebDensity`); a cluster without a section switch (`galaxyCatalogs`) resolves on the item alone. Mutation-check by dropping the section half.
- [ ] Test `every entry's switch resolves in the initial settings`: for each `APP_VISIBILITY` entry and item, `typeof visibilitySwitchOf(initialSettings, entry, item) === 'boolean'`. This catches a wrong `cluster` or item list.
- [ ] Commit.

### Task 3: The target, gating, per-item `of`, seed and recompute

**review: yes**: sagas and state, plus `slot.committed()` semantics.

**Files:**
- create `src/utils/visibility/fadeIdentityKey.ts`, `fadeIdentitiesOf.ts`, `visibilityTargetOf.ts`
- create `src/@types/engine/state/VisibilityGates.d.ts`; `src/services/engine/wiring/collectVisibilityGates.ts`, `seedVisibilityFades.ts`, `syncVisibilityTargets.ts`, `syncVisibilityTarget.ts`, `installVisibilityGates.ts`
- modify `src/@types/loading/AssetWiringRow.d.ts` (`gates?`), `src/@types/animation/FadeRegistry.d.ts` and `src/services/animation/fadeRegistry.ts` (also accept `FadeIdentity`), `src/@types/engine/state/EngineState.d.ts` (`visibilityEntries`, `visibilityGates`), `src/services/engine/engine.ts` (initial values), `src/services/engine/phases/createLayers.ts` (compose `visibilityEntries`), `src/services/engine/phases/wireSlots.ts` (seed + install), `src/services/engine/wiring/makeReconcileEffects.ts` (`syncFades` also runs the new sync)
- modify the gating asset rows: `src/layers/localBubble/load/localBubbleAssetRows.ts`, `src/layers/constellations/load/constellationsAssetRows.ts`, `src/layers/flow/load/flowAssetRows.ts`, `src/layers/cosmicWebFilaments/load/filamentsAssetRows.ts`, `src/layers/galaxyCatalog/load/galaxyCatalogAssetRows.ts`, `src/layers/cosmicWebDensity/load/cosmicWebDensityAssetRows.ts`, `src/layers/starCatalog/load/starCatalogAssetRows.ts`
- tests: create `tests/utils/visibility/visibilityTargetOf.test.ts`, `tests/services/engine/wiring/installVisibilityGates.test.ts`, `tests/services/engine/wiring/syncVisibilityTargets.test.ts`; modify `tests/services/animation/fadeRegistry.test.ts`, `tests/services/engine/phases/wireSlots.test.ts`, `tests/services/engine/wiring/makeReconcileEffects.test.ts`

**Contract:**

```ts
// AssetWiringRow gains:
readonly gates?: VisibilityAddress | { readonly address: VisibilityAddress; readonly item: string };
fadeIdentityKey(id: FadeIdentity): string          // item === undefined ? address : `${address}:${item}`
fadeIdentitiesOf(entry: VisibilityEntry): readonly FadeIdentity[]  // one per item, or one item-less
type VisibilityGates = ReadonlyMap<string, Pick<AssetSlot<unknown, unknown>, 'committed'>>
visibilityTargetOf(settings, entries: readonly VisibilityEntry[], entry, item: string | undefined,
                   gates: VisibilityGates): 0 | 1
  // switch && (no gate for this identity || gate.committed() !== null)
  //        && (entry.of === undefined || visibilityTargetOf(<the show entry named by of>, item) === 1)
  // `of` resolves for the SAME item: undefined for an item-less label, the label's own item otherwise.
collectVisibilityGates(state): VisibilityGates   // state.assetRows' `gates` → slotFor(state, row.key)
seedVisibilityFades(state): void                 // register every identity at its boot target
syncVisibilityTargets(state, opts: { animate: boolean; only?: readonly VisibilityAddress[]; durationMs?: number }): void
  // `only` covers the named addresses AND every label entry whose `of` names one of them
syncVisibilityTarget(state, id: FadeIdentity): void
  // one identity, animated, default durations; also { address: <label>, item: id.item } for each
  // label entry whose `of` names id.address and whose items include id.item (item-less: id.item undefined)
installVisibilityGates(state): void              // each gating slot's subscribe → syncVisibilityTarget(its identity)
```

Gating rows: localBubble `'localBubble'`, constellations `'constellations'`, filaments `'cosmicWebFilaments'`, flow `'flow'`; galaxy catalog point rows `{ address: 'survey', item: entry.id }` (`pointRow`, `galaxyCatalogAssetRows.ts:22-39`); density rows `{ address: 'cosmicWebDensity', item: entry.id }` (`cosmicWebDensityAssetRows.ts:21-34`); star survey rows `{ address: 'starCatalog', item: id }` (`starCatalogAssetRows.ts:16-29`; new, since the star catalog had no fade row: Gaia now fades in on arrival). The star rows have no `release` predicate and demand loss never releases a slot (`reevaluateDemand.ts:86-98`), so a star toggle-off keeps the data drawn through its fade-out. The structure `.ccat` row and the `famousStarsMeta` row gate nothing (spec "Gating"). Keep the `targetOf` short-circuit (`syncVisibilityFades.ts:35`): a target already held never restarts a ramp. Keep the wake rule (`syncVisibilityFades.ts:49-79`): one `requestRender` after a non-animated batch, none after an animated one. Read `committed()`, never `state()` (`AssetSlot.d.ts:22-29`). `release()` notifies with `idle` (`src/services/loading/AssetSlot.ts:269-294`), which is what lowers the Local Bubble target; since #892 an excluded galaxy-catalog tier commits nothing and its release lowers that catalog's target the same way. The old `seedFades`/`installFadeOnArrival`/`syncVisibilityFades` keep running untouched over `state.fadeRows`. The registry holds both id shapes until Task 12, and their keys never collide (`FadeId` kinds vs addresses: assert that in the registry test).

- [ ] Test `visibilityTargetOf` truth table: switch × present (4 cases); `an ungated entry is present`; `a per-item entry resolves per item` (two items, one gated slot committed, one not); `a label with of is off while its thing's target is off` (switch on, `of` target 0 → 0). Mutation-check the last by dropping the `of` term.
- [ ] Test `a per-item of label follows its own item` (Review Focus #8): ring `void` off, ring `supercluster` on, both labels on → `label:structure:void` is 0 and `label:structure:supercluster` is 1. Mutation-check by resolving `of` without the item (or against "any item on").
- [ ] Test `a gating commit raises the target` and `release() lowers it` (the Local Bubble case: committed → release → target 0 → recommit → 1).
- [ ] Test `a reload keeps the target`: a slot in `loading` over a committed value issues no `fadeTo`.
- [ ] Test `a gating commit retargets only its own item`: two survey items, only A's slot notifies, and B's `fadeTo` is never called.
- [ ] Test `a gating commit also retargets the label entries whose of names it`: the constellations slot commits and `label:constellations` gets its `fadeTo` in the same call.
- [ ] Test `only also covers the label entries whose of names it` (Review Focus #7): `only: ['constellations'], durationMs: 3000` issues `fadeTo(label:constellations, …, 3000)`. Mutation-check by narrowing `only` to the named addresses.
- [ ] Port the load-bearing `applyIntent` tests into `syncVisibilityTargets.test.ts`: no re-issue to a held target, retarget of an in-flight fade, `only` narrows by address, `durationMs` threads to every animated `fadeTo`, and the one-wake rule. Do not port guard/`post` tests: those concepts are gone.
- [ ] Commit.

### Task 4: The resolver, liveness, and the core gates for passes, planners and label producers

**review: yes**: a frame-path contract, and the producer-skip rule is Review Focus #3.

**Files:** create `src/services/engine/presentation/resolveVisibilityOpacity.ts`, `src/services/engine/presentation/resolveFadeValue.ts`, `src/services/engine/presentation/visibilityLiveOf.ts`, `src/services/engine/layer/gatePassByFade.ts`, `src/services/engine/layer/gatePlannerByFade.ts`, `src/services/engine/layer/gateLabelProducer.ts`; modify `src/services/engine/presentation/focusRecession.ts` (add `recessionFactor`), `src/@types/engine/subsystems/ClipPlayer.d.ts` + `src/services/engine/subsystems/clipPlayer.ts` + `src/@types/animation/ClipOpacityChannel.d.ts` + `src/services/animation/clipOpacityChannel.ts` (key type widened to `VisibilityLayerKey | VisibilityAddress` until Task 11), `src/services/engine/phases/createLayers.ts` (wrap `state.passes` (core and Layer), `state.planners`, every Layer screen and world label row); tests create `tests/services/engine/layer/gateLabelProducer.test.ts`, `tests/services/engine/layer/gatePassByFade.test.ts`, `tests/services/engine/presentation/resolveVisibilityOpacity.test.ts`; modify `tests/services/engine/phases/createLayers*.test.ts` as the wrap requires.

**Contract:**

```ts
recessionFactor(strength: 'strong' | 'mild' | undefined, blend: number): number  // lerp(1, STRONG|MILD, blend); undefined → 1
resolveVisibilityOpacity(state: Pick<EngineState, 'subsystems' | 'visibilityEntries'>,
                         snapshot: { nowMs: number; focusBlend: number },
                         address: VisibilityAddress, item?: string): number
  // fades.opacityOf({address, item}, nowMs) × recessionFactor(entry.recession, focusBlend)
  //   × clipOpacityOf(address, nowMs) × (entry.of ? clipOpacityOf(entry.of, nowMs) : 1)   (U7)
  // The handed value. Task 7's scene-body admission tests it > 0 (T7-4).
resolveFadeValue(state, snapshot, address): number | Readonly<Record<string, number>>   // per entry shape
visibilityLiveOf(state: Pick<EngineState, 'subsystems'>, id: FadeIdentity, nowMs: number): boolean
  // the registry's held target is 1 OR the RAW fade (no recession, no clip) is above 0. The one
  // liveness predicate, used by the producer skip. Core always passes an identity read from data
  // (an entry, a row's `label`), never a literal.
gatePassByFade(pass: ContentPass): ContentPass
  // no `fade` → returns pass unchanged; else enabled/pickEnabled → false without calling the inner when the
  // value is 0 (every item 0), and enabled/draw/pickEnabled/drawPick all get the SAME value as their last
  // argument: one value gates draw and pick (SQ2, behaviour change #6)
gatePlannerByFade(planner: FrameContentPlanner<T>): FrameContentPlanner<T>
  // no `fade` → unchanged; else `plan` gets the value as its last argument. Never skips: a planner's output
  // feeds passes that run their own gate (U6).
gateLabelProducer(row): Label2DProducer (and the Label3DProducer twin, same rule)
  // skip (return { labels: [], awake: false } without calling) iff no identity of the row's label entry is
  // live (visibilityLiveOf); else call with the resolved value as the third argument. The held target
  // already folds switch, present and `of`. Rows without `label` pass through unchanged.
```

Wrapping in `createLayers` keeps `executeFrame.ts`/`pickProgram.ts` untouched. The wrapper resolves entries from `state.visibilityEntries` at call time, so the same helper works for the core producer registered in `engine.ts:319-322` (Task 10) and the core `orbitTrailsPass` (Task 10).

- [ ] Test `gateLabelProducer`: `off and faded out → not called`; `off and still fading → called with the falling value`; `on → called`; `off with raw fade > 0 and clip 0 → still called` (Review Focus #3; mutation-check by switching the skip to the resolved value); a per-item row is skipped only when no item is live.
- [ ] Test `gatePassByFade`: a per-item pass with one non-zero item calls the inner `enabled` with the record; all items at 0 → `enabled` and `pickEnabled` are false and the inner is never called.
- [ ] Test `resolveVisibilityOpacity`: hand-computed `0.5 × 0.15 × clip 0.5` at blend 1 for a strong entry; a non-receding entry ignores blend; `an of label carries its of entry's clip` (clip `constellations` 0.5, own clip 1 → `label:constellations` resolves to half its raw fade × recession). Mutation-check the last by dropping the `of` clip.
- [ ] No test for `gatePlannerByFade`: it only threads an argument the compiler checks.
- [ ] **Gate:** `npx tsc --noEmit` passes.
- [ ] Commit.

---

## Group B: single-toggle Layers, panel rows, stars

### Task 5: Migrate localBubble, constellations, cosmicWebFilaments, flow, lightTime, zoneOfAvoidance and missions

Per Layer: drop the `fades` member and delete its `present/*FadeRows.ts` (and that file's test). Every pass declares `fade: '<key>'` and uses the handed number in place of `resolveLayerOpacity`/`fades.opacityOf`; the "setting on OR opacity > 0" gate goes, since the core skip owns it. Every label producer declares `label: '<name>'` and uses its own handed label value: constellation captions `label: 'constellations'`, lightTime captions `label: 'lightTime'`, ZoA lettering (a world label) `label: 'zoneOfAvoidance'`. Today these three read their show fade (`constellationsFade.ts:15`, `deriveLightTimeLiveness.ts:23`, `deriveZoneOfAvoidanceLiveness.ts:18-19`); their label entries' `of` now carries the "vanishes with its Layer" behaviour, and the captions' recession comes from the label entry (`strong` for constellations, none for the other two, as today). A clip on the show key still dims the label, because an `of` label's value carries its `of` entry's clip (U7, Task 4): today's look holds. Shared liveness helpers take the number as a parameter instead of reading the registry, so the pass hands its show value and the producer its label value. Rewrite each `create.ts` header line that names `installFadeOnArrival` (the asset row's `gates` now does that job).

**Files:**
- localBubble: `layer.ts`, `passes/localBubblePass.ts`, `create.ts`, delete `present/localBubbleFadeRows.ts`
- constellations: `layer.ts`, `passes/constellationsPass.ts`, `present/constellationsFade.ts` (→ `(ctx, fade: number)`), `present/produceConstellationCaptions.ts`, `create.ts`, delete `present/constellationsFadeRows.ts`; tests `constellationsPass.test.ts`, `constellationsFade.test.ts`, `produceConstellationCaptions.test.ts`, delete `constellationsFadeRows.test.ts`
- cosmicWebFilaments: `layer.ts`, `passes/filamentsPass.ts`, `create.ts`, delete `present/filamentsFadeRows.ts`; test `filamentsPass.test.ts`
- flow: `layer.ts`, `passes/flowFieldPass.ts`, `create.ts`, delete `present/flowFadeRows.ts`; tests `flowFieldPass.test.ts`, delete `flowFadeRows.test.ts`
- lightTime: `layer.ts`, `passes/lightTimeSpheresPass.ts`, `present/deriveLightTimeLiveness.ts`, `present/produceLightTimeCaptions.ts`, delete `present/lightTimeFadeRows.ts`; tests `deriveLightTimeLiveness.test.ts`, `produceLightTimeCaptions.test.ts`
- zoneOfAvoidance: `layer.ts`, `passes/zoneOfAvoidancePass.ts`, `passes/zoneOfAvoidanceUpsamplePass.ts`, `present/deriveZoneOfAvoidanceLiveness.ts`, `present/produceZoneOfAvoidanceLettering.ts`, delete `present/zoneOfAvoidanceFadeRows.ts`; tests `zoneOfAvoidancePass.test.ts`, `zoneOfAvoidanceUpsamplePass.test.ts`, `deriveZoneOfAvoidanceLiveness.test.ts`
- missions: `layer.ts` (drop `fades`), `passes/missionTrailsPass.ts` (`fade: 'missionTrails'`; the gate on PR 1's `missionTrails.enabled` and `resolveLayerOpacity` go, the handed number replaces `layerOpacity`; reword the header's "own setting and fade"), delete `present/missionTrailsFadeRows.ts` (it has no test); test `tests/layers/missions/passes/missionTrailsPass.test.ts` (its one case, `follows missions.trails alone, not orbitTrails`, only restates the gate core now owns: delete it, and the file if nothing is left). Its caption producer (PR 1's `produceMissionCaptions`) migrates in Task 10 with the other NEAR0 captions, because they share `composeForegroundCaption`. The Layer loads its tracks through a saga into core's `trajectoryRegistry`, not an asset row, so it declares no `gates`, as the body Layer's orbit trails do not.
- `src/services/engine/presentation/captionFadeRules.ts` (the `constellation` row's comment at `:163-178` names `resolveLayerOpacity`; reword it)
- `tests/helpers/engine/makeFadeBridgeState.ts` (drop the migrated rows and their runtimes, `missionTrailsFadeRows` at `:21,126` included); `tests/services/engine/wiring/fadeLayers.test.ts` (imports `zoneOfAvoidanceFadeRows` and `missionTrailsFadeRows`, `:24,27,245,247`) and `tests/services/engine/wiring/installFadeOnArrival.test.ts` (imports `filamentsFadeRows`): drop the deleted rows from their fixtures, or the cases that existed only for them. Both files die in Task 12.

Keep `localBubblePass`'s `hasMesh()` check, `flowFieldPass`'s `slotReady` check, and `missionTrailsPass`'s distance cut, presence and track checks and `emphasisDim` (Final review (e)). None is fade logic.

- [ ] Migrate each Layer. Rewrite the tests that stubbed `fades.opacityOf` for these passes and producers so they pass the value as the last argument; delete assertions that only restated the "setting OR opacity" gate.
- [ ] No new test: `gatePassByFade`/`gateLabelProducer` own the skip, Tasks 3 and 4 pin `of` and its clip, and each consumer's own value-use tests remain.
- [ ] Commit.

### Task 6: Panel rows name their entry, the Orbit trails row included

**Files:** create `src/@types/engine/layer/LayerToggleRow.d.ts`; modify `src/@types/engine/layer/LayerUiSlots.d.ts`, `src/@types/engine/layer/Layer.d.ts` (the `ui` doc at `:64-66` names the container; the rows are now built in `selectToggleRows`), `src/compositions/selectToggleRows.ts`, `src/components/containers/LabelsAndGuidesSectionContainer.tsx` (its `layerRows` prop type, `:18,22`), `src/layers/{localBubble,constellations,lightTime,zoneOfAvoidance,missions,body}/layer.ts`; delete `src/layers/{localBubble,constellations,lightTime,zoneOfAvoidance}/ui/*SettingsRow.ts`, `src/layers/missions/ui/missionTrailsSettingsRow.ts`, `selectMissionTrailsEnabled` in `src/layers/missions/state/missionTrails/selectors.ts` (PR 1; its only reader is that row) and `src/@types/engine/layer/LayerSettingsRow.d.ts` (nothing else uses it once the rows go); tests `tests/compositions/selectToggleRows.test.ts`, `tests/components/containers/LabelsAndGuidesSectionContainer.test.ts`, `tests/components/SettingsPanel/LabelsAndGuidesSection.test.ts` (it builds a `toggle-constellations` row, `:52-54`), `tests/packages/website/docsReference.test.ts` (its hand `'Orbit trails'` at `:148` goes: the body Layer's row now arrives through `layerUiContents` at `:149`).

**Where rows are built (#888).** Since `7ab7ec0fd` the container builds nothing: `selectToggleRows(state, layerRows)` (`src/compositions/selectToggleRows.ts`) returns every checkbox as a `ToggleRow` (`{ id, label, enabled, set }`, `src/@types/settings/ToggleRow.d.ts`), and the container only binds each row's `set` to `dispatch` (`LabelsAndGuidesSectionContainer.tsx:31-40`). `ToggleRow` keeps its shape: it is the React-free row a caller without a component tree reads and flips. The change lands in the selector.

**Contract (SQ7, U4):** `LayerToggleRow = { readonly toggle: ShowKey; readonly label: string }`; `LayerUiSlots.labelsAndGuides: LayerToggleRow`; a Layer writes `{ slot: 'labelsAndGuides', content: { toggle: 'localBubble', label: 'Local Bubble' } }`, the same `{ slot, content }` shape as every other `LayerUiEntry`. Keep today's labels: 'Local Bubble', 'Constellations', 'Light-time spheres', 'Zone of Avoidance', 'Mission trails', 'Orbit trails'. The missions Layer's row is `{ toggle: 'missionTrails', label: 'Mission trails' }`; its entry's cluster is `missionTrails` (PR 1). The body Layer gains `ui: [{ slot: 'labelsAndGuides', content: { toggle: 'orbitTrails', label: 'Orbit trails' } }]`, and `selectToggleRows`'s hand-authored orbit-trails row with its comment (`:69-75`), its selector and setter imports (`:18-19`), its read and memo key (`:58`, `:60`) and the header's "the orbit-trails guide row" (`:3`) go.

```ts
selectToggleRows(state: RootState, layerRows: readonly LayerToggleRow[]): readonly ToggleRow[]
  // per Layer row: the show entry whose key is row.toggle, from APP_VISIBILITY (compositions/ may import it)
  //   id: `toggle-${row.toggle}`, label: row.label,
  //   enabled: visibilitySwitchOf(state.settings, entry),
  //   set: (on) => setVisibility({ cluster: <the entry's cluster>, field: 'enabled', on })
```

Reading `state.settings` here is safe for the memo: the per-row values are booleans fed to `memoizeLastByKeys` as keys (`:51`, `:59-60`), so an unrelated write still returns the same array. Order: label-category rows, then Layer rows in composition order; the body Layer is last, so Orbit trails becomes the last row (behaviour change #11) and Mission trails stays the first Layer row. The checkbox id becomes `toggle-${toggle}`; update the test selectors (`#toggle-zone-of-avoidance` → `#toggle-zoneOfAvoidance`, `#toggle-orbit-trails` → `#toggle-orbitTrails`, `toggle-mission-trails` → `toggle-missionTrails`; nothing outside `selectToggleRows.ts`, the Layer row files and these tests references the old ids). `setOrbitTrailsEnabled` stays: the tools still dispatch it (`tools/utils/capture/sceneDeclutterActions.ts`, `tools/site/utils/siteShotActions.ts`). `setMissionTrailsEnabled` keeps one reader, `visibilityActionRow.ts:59`, until Task 12.

- [ ] Rewrite the container test's Layer-row case: clicking the Local Bubble row dispatches `setVisibility({ cluster: 'localBubble', field: 'enabled', on: false })` and the box reflects the store (use `fireEvent.click`, `testing.md:149-163`).
- [ ] Rewrite `toggling the orbit-trails row dispatches setOrbitTrailsEnabled` (`LabelsAndGuidesSectionContainer.test.ts:161`) as the same click case on `#toggle-orbitTrails` dispatching `setVisibility({ cluster: 'orbitTrails', field: 'enabled', on: false })`. It fails if the body Layer's row is missing or names the wrong cluster. Rewrite `appends the ZoA Layer row after the core guide rows` (`:185`) to the new order: the ZoA row before Orbit trails.
- [ ] `selectToggleRows.test.ts`: pass the composed rows (`layerUiContents(APP_COMPOSITION.layers, 'labelsAndGuides')`, one stable array) instead of `NO_LAYER_ROWS`, and run `a row's set builds the action that flips its own value` (`:25-32`) over `toggle-orbitTrails` and `toggle-missionTrails` in place of `toggle-orbit-trails`. Keep `returns the same array when an unrelated slice changes` (`:19-23`): it guards the memo the boolean keys feed.
- [ ] Commit.

### Task 7: One sort over every scene body; the star entry declares the bodies it covers

**review: yes**: it changes `ReadyFrameContext` (consented, T7-3), re-routes NEAR0's painter range and the scene occluders, and makes the frame context resolve handed values.

**NEAR0's bodies: a named leftover (T7-5, ruled 2026-10-16).** NEAR0's depth range (`deriveView`) spans the resolved bodies the NEAR0 row draws: today the star spheres, since planets and craft draw in their own `'body'` slab rows (spanning a resolved planet would move NEAR0 in the painter order, `slabs.ts:365-372`). No data says this yet. The bodies-into-Layers PR gives each body row a slab field that says which slab draws it; until then, NEAR0 spans the resolved bodies outside core's own rosters (`state.data.bodies.planets`, `ctx.snapshot.meshBodies`), the complement of the rule `sceneBodyPartition` uses. That filter is the leftover: one function, `near0SphereBodies`, in `src/services/engine/frame/`, whose header names it as the stand-in for the slab field and the PR that deletes it. It branches on core's rosters, never on a Layer key, a star table or a body kind.

Ruled 2026-10-15 and 2026-10-16 (REVERT, T7-1 to T7-4). Today core runs two sorts. `partitionBodiesByPresentation` splits planets and mesh bodies at `BODY_GLINT_MAX_PX = 3` (glint below; flat, textured or mesh at or above). `partitionStarsByResolution` splits `visibleStars(settings.starCatalogs)` at `STAR_RESOLVE_PX = 4` (point below, sphere at or above), and core picks the star set by reading the star switches by name (`visibleStars.ts`, `frameContext.ts:113-119`, `sceneOccluderBodies.ts:34-39`, `deriveView.ts:116-133`). After this task there is one sort over one roster, and every rule in it reads data:

- **Which bodies an entry covers (T7-1).** A show entry may declare `bodies`: per item, the scene bodies that item draws. The star show entry declares `bodies: SEEDED_STAR_CATALOGS`; no other entry declares it. Core reads it off `state.visibilityEntries` and never names the key.
- **Admission (T7-4).** A body is admitted while every identity covering it has a handed value (fade × recession × clip, the value every consumer reads) above 0. A body no entry covers (planets, moons, craft) is always admitted. A star faded or clipped to 0 is in neither NEAR0's depth range nor the occluder set.
- **The dot/sphere size (T7-2).** Each scene body carries its own `resolvePx` on its seed record; the sort reads it and branches on nothing else.
- **The frame field (T7-3).** `ReadyFrameContext.positionedStars` becomes `sceneBodies`: every admitted scene body, positioned once per frame in `frameContext.ts`. A data field, not a function.
- **Who draws what.** The sort splits every body by presentation into two branches. Each drawing pass takes the bodies it owns from each branch, identified by its own data: core's body passes by core's rosters, the star passes by the star Layer's seed refs. No pass and no core file branches on a Layer key or a body kind to find its bodies.

**Files:**
- create `src/@types/engine/frame/PositionedSceneBody.d.ts`, `src/@types/engine/frame/SceneBodyPresentation.d.ts`, `src/@types/engine/frame/CoveredSceneBody.d.ts`, `src/utils/visibility/sceneBodyCoverageOf.ts`, `src/services/engine/frame/sceneBodyPresentation.ts`, `src/services/engine/frame/near0SphereBodies.ts` (the T7-5 leftover), `src/data/bodies/starResolvePx.ts`, `src/data/bodies/bodyGlintMaxPx.ts`, `src/layers/starCatalog/@types/SeededStarRef.d.ts`, `src/layers/starCatalog/present/seededStarRefs.ts`
- modify `src/@types/engine/layer/ShowEntry.d.ts` (`bodies?`), `src/layers/starCatalog/visibility.ts` (the star show entry's `bodies`)
- modify `src/@types/scene/{StarBody,PlanetBody,MeshBody,EarthBody}.d.ts` (`resolvePx`), the record builders `src/data/bodies/makers/{star,heliocentricPlanet,satelliteBody,meshBody}.ts`, `src/data/bodies/sceneSStars.ts` (builds its `StarBody` records inline), `src/data/bodies/sceneEarth.ts`
- modify `src/services/engine/frame/partitionBodiesByPresentation.ts` (two branches; `BODY_GLINT_MAX_PX` moves out), `src/services/engine/frame/sceneBodyPartition.ts` (reads the presentation; signature kept), `src/services/engine/frame/frameContext.ts` (builds `sceneBodies`; the `visibleStars` read goes), `src/@types/engine/frame/ReadyFrameContext.d.ts`, `src/services/engine/frame/deriveView.ts`, `src/services/engine/frame/sceneOccluderBodies.ts`; the `BODY_GLINT_MAX_PX` importers `src/services/engine/presentation/scaleFadeBands.ts` and `src/utils/scene/bodyGlintBrightness.ts`
- modify the star Layer: `src/layers/starCatalog/passes/{starPointsPass,starSpheresPass}.ts` (their share of the presentation), `src/layers/starCatalog/passes/fieldStarSpherePass.ts` (the `STAR_RESOLVE_PX` import; its header's `visibleStars`/`partitionStarsByResolution` lines), `src/layers/starCatalog/create.ts` (the boot seed)
- comments naming a deleted helper: `src/@types/scene/{StarBody,PositionedStar}.d.ts`, `src/data/bodies/seededStarCatalogs.ts` (core no longer reads it; the star entry's `bodies` does), `src/services/engine/data/createEngineData.ts:16`, `src/@types/engine/data/BodyStore.d.ts:17`, `src/utils/scene/bodyApparentDiameterPx.ts:7`, `src/utils/picking/seedIndexOfBody.ts:5`, `src/services/engine/frame/passes/{bodyGlintsPass,planetsPass,texturedBodiesPass}.ts` headers where they name the partition's branches
- delete `src/services/engine/frame/{visibleStars,positionedVisibleStars,partitionStarsByResolution}.ts` and `src/utils/star/resolvesToSphere.ts` (its only caller is the star partition), with `tests/services/engine/frame/{visibleStars,positionedVisibleStars,partitionStarsByResolution}.test.ts` and `tests/utils/star/resolvesToSphere.test.ts`; `tests/services/engine/frame/frameFilePurity.test.ts` loses its `'frame/visibleStars'`, `'frame/partitionStarsByResolution'` and `'frame/partitionBodiesByPresentation'` rows (the ratchet shrinks: the last one's offender was the `BODY_GLINT_MAX_PX` export)
- tests: `tests/compositions/appVisibility.test.ts`, `tests/services/engine/frame/{partitionBodiesByPresentation,sceneBodyPartition.presence,frameContext,deriveView,sceneOccluderSpheres}.test.ts`, `tests/layers/starCatalog/passes/{starPointsPass,starSpheresPass,fieldStarSpherePass}.test.ts`, and whichever of `tests/services/engine/frame/{frameContext.meshBodyHost,runFrame,renderFrame}.test.ts`, `tests/services/engine/helpers/pickFrameContext.test.ts`, `tests/services/engine/frame/passes/{orbitTrailsPass,planetsPass}.test.ts`, `tests/layers/starCatalog/present/produceStarCaptions.test.ts`, `tests/data/bodies/sceneAnchors.test.ts` and `tests/data/sources/sStarSource.test.ts` build a `ReadyFrameContext`, mock `sceneBodyPartition`, import a deleted helper, or stub `starCatalogs` only to reach the star set. Every test fixture that builds a body record literal gains `resolvePx` (let `npx tsc --noEmit` list them).

**Contract:**

```ts
// ShowEntry gains (T7-1, consented):
readonly bodies?: Readonly<Partial<Record<string, readonly SceneBody[]>>>;
  // per item: the scene bodies that item draws. Every key is an item of the entry.
// src/layers/starCatalog/visibility.ts: the star show entry declares `bodies: SEEDED_STAR_CATALOGS`
//   (data only: `visibility.ts` still imports no Layer-typed module)

// StarBody, PlanetBody, MeshBody and EarthBody gain (T7-2), as seed-record data, not a Layer member:
readonly resolvePx: number;
  // apparent diameter (px) at or above which the body draws resolved (sphere or mesh); below it, a point or glint
// star maker and sceneSStars.ts:                         resolvePx: STAR_RESOLVE_PX
// heliocentricPlanet, satelliteBody, meshBody, sceneEarth: resolvePx: BODY_GLINT_MAX_PX
// src/data/bodies/starResolvePx.ts   STAR_RESOLVE_PX = 4, with its doc moved from partitionStarsByResolution.ts:
//   a star's handoff swaps a soft point for a sphere of the same emissive colour, near-seamless at a few px
// src/data/bodies/bodyGlintMaxPx.ts  BODY_GLINT_MAX_PX = 3, with its doc moved from partitionBodiesByPresentation.ts:
//   equal to the `bodyGlint` fade band's `goneAt`, so the glint has faded out when the sphere or mesh takes over

// src/@types/engine/frame/PositionedSceneBody.d.ts
export type PositionedSceneBody = { readonly body: SceneBody; readonly positionMpc: Readonly<Vec3> };
// src/@types/engine/frame/SceneBodyPresentation.d.ts
export type SceneBodyPresentation = {
  readonly unresolved: readonly PositionedSceneBody[];  // apparent diameter below the body's resolvePx
  readonly resolved: readonly PositionedSceneBody[];    // at or above it
};
// src/@types/engine/frame/CoveredSceneBody.d.ts
export type CoveredSceneBody = { readonly body: SceneBody; readonly coveredBy: readonly FadeIdentity[] };

sceneBodyCoverageOf(entries: readonly VisibilityEntry[]): ReadonlyMap<string, CoveredSceneBody>
  // keyed by body id, in entry, item and table order; coveredBy holds { address: the entry's key, item }
  // for every item whose `bodies` lists the body. Memoised on the `entries` reference
  // (createLayers composes `state.visibilityEntries` once).

// ReadyFrameContext (T7-3, consented): positionedStars goes
sceneBodies: readonly PositionedSceneBody[];
  // every admitted scene body except Earth (its own renderer, as today), at this frame's bodyStates
// deriveFrameContext builds it once per frame:
//   roster: state.data.bodies.planets, the present meshBodies, then every body sceneBodyCoverageOf lists
//   (a body appears once)
//   admitted iff every identity in its coveredBy (none for an uncovered body) resolves above 0:
//     resolveVisibilityOpacity(state, { nowMs, focusBlend: 0 }, id.address, id.item) > 0
//   Recession never reaches 0 (STRONG_RECESSION is its floor), so the sign does not depend on the blend,
//   which runFrame fills in later. Resolve once per distinct identity per frame, not once per body.

partitionBodiesByPresentation(input: {
  bodies: readonly PositionedSceneBody[];
  camPosMpc: Readonly<Vec3>;
  pxPerRad: number;
}): SceneBodyPresentation
  // resolved iff bodyApparentDiameterPx(positionMpc, bodyFootprintRadiusM(body)) >= body.resolvePx
  // pure, disjoint and covering, input order kept per branch; filters nothing; no branch on body kind
sceneBodyPresentation(ctx: FrameView): SceneBodyPresentation
  // partitionBodiesByPresentation over ctx.snapshot.sceneBodies at ctx.drawCamPos and ctx.drawPxPerRad:
  // the one binding every pass shares. Each call sorts afresh: no cached per-view answer (the pick path
  // derives frame contexts speculatively).
sceneBodyPartition(state: PassState, ctx: FrameView)   // signature and return ({ glints, flat, textured, meshes }) kept
  // core's own bodies out of sceneBodyPresentation(ctx), found by core's rosters (state.data.bodies.planets,
  // ctx.snapshot.meshBodies): glints = their unresolved; their resolved → meshes, textured (texture registry
  // and residency, as today) or flat

near0SphereBodies(resolved: readonly PositionedSceneBody[],
                  rosters: { planets: readonly PlanetBody[]; meshBodies: readonly MeshBody[] }): readonly PositionedSceneBody[]
  // LEFTOVER (T7-5): the resolved bodies outside core's own rosters, which NEAR0 draws today. Stands in for
  // the per-body slab field the bodies-into-Layers PR adds, and is deleted there.

// src/layers/starCatalog/@types/SeededStarRef.d.ts
export type SeededStarRef = {
  readonly item: SeededStarCatalogId;      // the star show entry's item: the key into the handed fade (Task 8)
  readonly source: StarCatalogSourceType;  // with seedIndex: the stable pick id, as PositionedStar carried it
  readonly seedIndex: number;
};
// src/layers/starCatalog/present/seededStarRefs.ts
export const SEEDED_STAR_REFS: ReadonlyMap<string, SeededStarRef>
  // body id → ref, built from SEEDED_STAR_CATALOGS_BY_SOURCE (one table per source, never merged)
```

- **Who draws what.** Core's `bodyGlintsPass`, `planetsPass`, `texturedBodiesPass`, `drawableMeshBodies` (and through it `meshBodiesPass`) and `scheduleProbeCapture` keep calling `sceneBodyPartition(state, ctx)` unchanged. `starSpheresPass` draws and picks the bodies of `sceneBodyPresentation(ctx).resolved` that `SEEDED_STAR_REFS` holds; `starPointsPass` those of `.unresolved`. Each gates `enabled` on its own share being non-empty, packs a star's pick id from its ref, and builds `StarPointRenderer.setStars`' `PositionedStar` from the body, its position and its ref. The star passes look their stars up by their own seed data, as `planetsPass` looks its planets up with `seedIndexOfBody(id, SCENE_PLANETS)`.
- **`deriveView`** sizes NEAR0's range from `snapshot.sceneBodies` through `partitionBodiesByPresentation` at its own `drawCamPos` and `pxPerRad`, at `outerBoundRadiusM`, over the bodies NEAR0 draws: `near0SphereBodies` of the resolved branch (the leftover at the top of this task). Do not filter by star tables or body kind.
- **`sceneOccluderBodies`** reads one `sceneBodyPresentation(ctx)` and takes every resolved body with a ground `surface` (the stars and the resolved planets, which are today's flat, textured and star-sphere sets) at `innerBoundRadiusM`. A mesh body has no surface and occludes through the sampled `foreground:0` depth, as today (its header). Earth stays as today, gated on `earth.resolvePx` in place of the imported constant.
- **Pixel-neutral at rest.** A star's footprint radius is its datum (every seeded star has `reliefM: [0, 0]`), so sizing it through `bodyFootprintRadiusM` is today's `surface.datumRadiusM`. Positions come from the same `bodyStates` map `positionedVisibleStars` read. The star passes' `draw` partitioned at `view.camPos` and their `enabled` at `ctx.drawCamPos`; both now go through `sceneBodyPresentation(ctx)`. The two coincide on NEAR0 because `RENDER_ORIGIN_MPC` is the origin (`starSpheresPass.ts` header).
- **Admission before Task 8.** Until Task 8 the star passes draw admitted stars at full value, so this commit alone holds a toggled-off star at full opacity through its 600 ms fade-out and then drops it; Task 8 turns that into the fade.
- **Uncovered bodies.** Planets, moons and mesh bodies are covered by no entry (`BodySettings.d.ts`: `bodies.items[id].enabled` has no reader), so core admits them always, as today. A body show entry would be new behaviour, not this task.
- **No identity in core.** Core reads `ShowEntry.bodies` off the composed entries and the identity it builds from the entry; no core file names `'starCatalog'` or imports `SEEDED_STAR_CATALOGS`.
- **Cost, priced now.** Admission resolves three star identities per frame. Each `sceneBodyPresentation` call sizes every scene body (~160 stars plus the planets and craft): about a dozen calls a frame at a near-field pose, so ≈2,500 apparent-size evaluations (a subtract, a hypot, a divide each), tens of µs, against the seven separate star sorts per frame it replaces. If `npm run perf:cpu` shows a frame row more than 0.1 ms slower, STOP and report.
- `fieldStarSpherePass` stays out of the sort, as today (its sphere is a catalogued Gaia star, not a scene body); it imports `STAR_RESOLVE_PX` from `src/data/bodies/starResolvePx.ts`.
- `starCatalog/create.ts`'s boot seed uploads every `SEEDED_STAR_REFS` star at J2000 (today `visibleStars` of the boot settings; `starPointsPass` re-uploads before the first draw, so the set does not matter).
- **Star helpers, in sum.** Deleted: `visibleStars`, `positionedVisibleStars`, `partitionStarsByResolution`, `resolvesToSphere`, `ReadyFrameContext.positionedStars`. Moved to `src/data/bodies/`: `STAR_RESOLVE_PX`, `BODY_GLINT_MAX_PX`. Kept: `PositionedStar` (the point renderer's input).

- [ ] Test `every bodies key is an item of its entry` (`appVisibility.test.ts`). Mutation-check by adding a key the star entry lacks.
- [ ] Test `each body resolves at its own size` (`partitionBodiesByPresentation.test.ts`; Review Focus #14): a planet (`resolvePx` 3) and a star (`resolvePx` 4) both at 3.5 px apparent diameter → the planet is `resolved`, the star `unresolved`; at 4.5 px both are `resolved`. Mutation-check by comparing every body against one constant.
- [ ] Rewrite `is disjoint and covering — every body lands in exactly one bucket` over the two branches, star bodies included.
- [ ] Move today's four-branch cases (texture residency, mesh routing, glints) from `partitionBodiesByPresentation.test.ts` to `sceneBodyPartition.presence.test.ts`, fed through `sceneBodies`, and add `takes only core's own bodies`: a resolved star in `sceneBodies` lands in none of the four branches. Mutation-check by dropping the roster lookup (the star lands in `flat`).
- [ ] Test `a covered body is admitted only while every covering item's handed value is above 0` (`frameContext.test.ts`; Review Focus #11): a resolved Sun and one planet. The Sun's fade at 1 → the Sun is in `sceneBodies`; still fading out at 0.4 → in; at 0 → out, while the planet stays; raw fade 1 with a clip on `starCatalog` at 0 → out (T7-4). Mutation-check three ways: admit on liveness (the clip case fails), admit every body, treat an uncovered body as not admitted.
- [ ] Test `a star faded to 0 neither sizes NEAR0 nor occludes` (`deriveView.test.ts` and `sceneOccluderSpheres.test.ts`): the Sun resolved and in `sceneBodies` → NEAR0's range spans it at its outer bound and an occluder sits at its inner bound (today's values); the Sun absent from `sceneBodies` → neither. Mutation-check by sizing NEAR0 (resp. the occluders) from anything other than `sceneBodies`. Add `NEAR0 never spans a planet`: a resolved planet in `sceneBodies` leaves NEAR0's range as the stars alone set it. Mutation-check by dropping `near0SphereBodies`.
- [ ] `sceneOccluderSpheres.test.ts`'s `drops the Sun once it demotes to a point at Jupiter-range` keeps its value (the star's size now rides its record).
- [ ] Star pass tests: fixtures hand `ReadyFrameContext.sceneBodies` instead of `starCatalogs` switches; the sphere/point XOR and pick-id cases keep their values. Delete the cases that only restated the section AND (Task 2 pins the rule).
- [ ] **Gate:** `npx tsc --noEmit` passes (`ShowEntry` now reaches the scene body types, and `frameContext.ts` the resolver). On a circular alias, cut the `visibility.ts` import chain that reaches a Layer-typed module; never reach for `APP_COMPOSITION`.
- [ ] `grep -rnE "starCatalogs|SEEDED_STAR|visibleStars|positionedVisibleStars|partitionStarsByResolution|resolvesToSphere|positionedStars|STAR_RESOLVE_PX" src/services/engine/frame src/services/engine/helpers src/@types/engine/frame` prints nothing, and the core-address grep (Final review mandate (d)) shows no `starCatalog` hit.
- [ ] Commit.

### Task 8: The star show entry: star passes, the cut and the spheres read the handed value

The hand ANDs of `starCatalogs.enabled` with an item switch go (U2). Task 7 put the star passes on core's one scene-body sort, drawing every admitted star at full value; here they take the handed value, and `starSourcesInBand.ts:18` with `starSourceDrawOpacity.ts:23` and `starCatalogAssetRows.ts:23-25` go. Both sphere passes, which PR 1 left drawing at opacity 1, hand their catalog's value to `starRenderer.draw` (V1). The caption ANDs (`captionFadeRules.ts:90-91,125-126`) go in Task 10. Behaviour change #9 lands here, except the captions' half (Task 10).

**Files:**
- passes, all `fade: 'starCatalog'`: `src/layers/starCatalog/passes/{starPointsPass,starSpheresPass,starCatalogPass,starAggregatesPass,starAggregateUpsamplePass,fieldStarSpherePass}.ts`
- `src/layers/starCatalog/frame.ts` (the planner declares `fade: 'starCatalog'` and hands it to `starCutInputs`)
- `src/layers/starCatalog/render/cut/{starCutInputs,starSourcesInBand,starCatalogVisible}.ts`, `src/utils/star/starSourceDrawOpacity.ts`
- `src/layers/starCatalog/render/starRenderer.ts` (header: the pipeline now fades a sphere; PR 1's "held at 1" wording goes)
- `src/layers/starCatalog/load/starCatalogAssetRows.ts` (demand), `src/layers/starCatalog/load/starCatalogSlot.ts` (header: "no fade replay" is now wrong), `src/@types/settings/StarCatalogSettings.d.ts` (the `enabled` doc: core's section rule reads it, consumers do not), `src/state/scene/captureSettings.ts` (the comment at `:17-21`: core's section rule and the caption entry read the two axes, not `visibleStars`)
- tests: `tests/layers/starCatalog/passes/*.test.ts` (all six), `tests/layers/starCatalog/render/cut/{starCutInputs,starSourcesInBand}.test.ts`, `tests/layers/starCatalog/load/starCatalogAssetRows.test.ts`, `tests/layers/starCatalog/frame.test.ts`

**Contract:**

```ts
starSourceDrawOpacity(entry: SourceEntry, fade: Readonly<Record<StarCatalogId, number>>, camDistPc: number): number
  // fade[id] × starCrossfadeOpacity(entry.crossfadePc, camDistPc); 0 for a non-survey row
starSourcesInBand(runtime, fade, camDistPc)       // no section read
starCatalogVisible(runtime, fade, ctx)
starCutInputs(runtime, settings, fade, views)     // `settings` keeps only the appearance knobs
// starSpheresPass:     starRenderer.draw(pass, mvp, body.color, fade[SEEDED_STAR_REFS.get(body.id)!.item])
// fieldStarSpherePass: starRenderer.draw(pass, mvp, tint, fade[<the loaded catalog's id>])
```

- Core admits a seeded star only while its catalog's handed value is above 0 (Task 7, T7-4), so the two seeded-star passes need no skip of their own. Each reads a star's catalog item from its `SEEDED_STAR_REFS` ref. `starPointsPass` multiplies each point's colour by `fade[ref.item]` on top of `backdropFade × focusAlphaMultiplier` (`:188-190`); the pick uses the same branch. `starSpheresPass` draws each sphere at that value. `fieldStarSpherePass` returns false from `enabled` while `fade[<the loaded catalog's id>] === 0` (today its gate reads only `currentCatalog`, `:150-155`, `:211-215`). The three Gaia passes hand `fade` to `starCatalogVisible`.
- The Gaia field fades through the cut's per-source `opacity` (`StarCutSourceInput.opacity`), which today carries the crossfade alone. Confirm that the GPU side already scales the draw by it. If it does not, STOP: that would be a shader change, and this PR edits no `.wesl`.
- Core's scene-body admission (Task 7) already reads the handed value; nothing in it changes here.
- `starCatalogAssetRows` demand becomes `visibilitySwitchOf(ctx.settings, <the star show entry>, id)`, which keeps today's section-and-item meaning.
- **The sphere fade.** Depth write stays on while fading: the sphere is convex and back-face culled (`starRenderer.ts:144-148`), so it never blends over itself; core keeps a fading star in `sceneBodies`, and so among the occluders, while its value is above 0 (Task 7), so the sampled and analytic trail occlusion agree through the fade. No `FRAME_ORDER` change: the two sphere passes are the only content of the NEAR0 row in the foreground chain (`frameSections.ts:238`). The `foreground:0 → hdr` composite is a straight-alpha OVER (`expandFrameOrder.ts:111`, `compositor.ts:159-165`), so over an empty foreground target the visible ramp follows `a²` in colour while the background behind falls by `1 − a`; the cloud deck behaves this way today. Accepted and judged in the smoke's before/after pair. If the fade visibly dips, STOP and report: do not change the composite. A half-faded Sun half-occludes a caption behind it (the overlays read `foreground:0` alpha): that is the intended reading. Picking is a separate pipeline (`bodyPickRenderer`), gated by the same value (SQ2).

- [ ] Test `the Gaia cut opacity is the crossfade times the handed value` (`starCutInputs.test.ts` or `starSourcesInBand.test.ts`): `fade.gaiaStars = 0.5` inside the band → the source's `opacity` is `0.5 ×` the crossfade; `0` → the source is absent. Mutation-check by dropping the multiply.
- [ ] Test `star points scale their colour by their catalog's value` (`starPointsPass.test.ts`): `famousStar` 0.5 and `sun` 1 → the uploaded famous-star colour is half its value-1 colour and the Sun's is unchanged. Mutation-check by dropping the multiply.
- [ ] Test `the field-star sphere is off while its catalog's value is 0` (`fieldStarSpherePass.test.ts`): a loaded Gaia catalog with a resolvable star in range, `fade.gaiaStars = 0` → `enabled` is false; `0.5` → true. Mutation-check by dropping the check.
- [ ] Test `a sphere draws with its catalog's handed value` (`starSpheresPass.test.ts`; Review Focus #12): a resolved Sun with `fade.sun = 0.5` → `starRenderer.draw` receives opacity 0.5. Same in `fieldStarSpherePass.test.ts` with `fade.gaiaStars = 0.5`. Mutation-check each by passing 1.
- [ ] Rewrite the pass tests that set `starCatalogs` switches to hand a fade record instead; delete the cases that only restated the section AND (Task 2 pins the rule).
- [ ] Commit.

---

## Group C: per-item and near-field Layers

### Task 9: Migrate milkyWay, cosmicWebDensity, galaxyCatalog and structure; the galaxy mask takes the handed value

**Files:**
- milkyWay: `layer.ts`, `present/milkyWayCloudLiveness.ts` (→ takes the disk value), `passes/milkyWayAggregatePass.ts`, `passes/milkyWayUpsamplePass.ts`, `passes/milkyWayPass.ts` (all `fade: 'milkyWayDisk'`), `present/produceMilkyWayLabel.ts` (row `label: 'milkyWay'`; delete the two-read skip at `:46-53` and the `resolveLayerOpacity` at `:71`, use the handed number), delete `present/milkyWayFadeRows.ts`; tests `milkyWayCloudLiveness.test.ts`, `milkyWayPass.test.ts`, `produceMilkyWayLabel.test.ts`, delete `milkyWayFadeRows.test.ts`
- cosmicWebDensity (SQ3): `layer.ts`, `passes/cosmicWebDensityPass.ts`, `passes/cosmicWebDensityUpsamplePass.ts` (both `fade: 'cosmicWebDensity'`, handed `Record<FieldId, number>`), `present/deriveCosmicWebDensityLiveness.ts` (→ takes the record; the master read and gate at `:21-25`, the recessed master at `:29` and the per-field multiply at `:36` all go: the section rule and the core skip own them), `create.ts`, `load/createCosmicWebDensitySlot.ts` (delete the trap note at `:4-7`; the upload-before-`ready` ordering no longer matters), delete `present/cosmicWebDensityFadeRows.ts`; tests `deriveCosmicWebDensityLiveness.test.ts`, delete `cosmicWebDensityFadeRows.test.ts`
- galaxyCatalog (SQ2, U6): `layer.ts`, `passes/galaxyPointSpritesPass.ts` (`fade: 'survey'`; `fadeOpacityOf` at `:76-80` becomes `fade[id]` × the deep-zoom band; `drawPick` filters `loadedSources()` on that same product being non-zero, with no mask read (PR 1's `sourceMaskOf(…).pick`) and no registry read; delete the "pick follows intent" comment above it; the header's per-source visibility lines now say the core skips the pass when every catalog is at 0 and the renderer skips a source at exactly 0), `frame.ts` (the planner declares `fade: 'survey'`; `sourceOpacity` at `:114-118` returns the handed value for the source's catalog id, so the LOD disks take exactly the point pass's value: recession (none for `survey`) and clip included; rewrite the comment at `:111-113`), `present/produceFamousGalaxyLabels.ts` (row `label: 'famousGalaxy'`; `layerAlpha = fade.famousGalaxy`; delete the skip at `:173-180` and the hand-built handle, clip and recession at `:210-222`), `src/layers/galaxyCatalog/state/galaxyCatalogs/selectors.ts` (the `selectVisibleSourceMask` comment: the panel's intent mask, no longer mirroring an engine mask), `load/wireGalaxyCatalogSourceSlot.ts` (header), delete `present/galaxyCatalogFadeRows.ts`; tests `galaxyPointSpritesPass.test.ts`, `produceFamousGalaxyLabels.test.ts`, `tests/layers/galaxyCatalog/state/galaxyCatalogs/selectors.test.ts` (its `sourceMaskOf` cross-check, `:19-39`, asserts the expected bits directly instead), delete `galaxyCatalogFadeRows.test.ts`
- galaxy mask (V3; PR 1 moved it into the Layer as `sourceMaskOf(state, nowMs): SourceMasks`): `src/layers/galaxyCatalog/present/sourceMaskOf.ts` (narrowed, below), delete `src/layers/galaxyCatalog/@types/SourceMasks.d.ts`; modify `src/layers/galaxyCatalog/frame.ts` (the planner's one `sourceMaskOf` call per `plan`), `src/@types/rendering/GalaxyPointDrawSettings.d.ts` (`:22-23`), `src/layers/galaxyCatalog/render/{galaxyPointRenderer,packGalaxyPointUniforms}.ts`, `src/layers/galaxyCatalog/subsystems/texturedDiskSubsystem.ts` (comment `:221`); tests: `tests/layers/galaxyCatalog/present/sourceMaskOf.test.ts`, `tests/layers/galaxyCatalog/frame.*.test.ts` (4 files), `tests/layers/galaxyCatalog/render/{galaxyPointRenderer,packGalaxyPointUniforms}.test.ts`, `tests/layers/galaxyCatalog/passes/galaxyPointSpritesPass.test.ts`, and every fixture that sets `visibleSourceMask` on a `GalaxyPointDrawSettings` (grep `visibleSourceMask` under `tests/`; the `DiskWalkInput` and `HiResFamousFrameInput` fixtures in `tests/layers/galaxyCatalog/subsystems/` keep theirs)
- structure (SQ1, U3): `layer.ts` (both label rows `label: 'structure'`; both marker passes keep no `fade`, the planner declares `fade: 'structureRing'`), `frame.ts`, `present/produceStructureLabels.ts` (use `fade[p.category]`; delete the per-category skip at `:93-98`, the clip read at `:69`, the focused exemption at `:151-157`, and the ring gate at `:103-111`: the label entry's `of: 'structureRing'` now carries "the label follows its ring", per item, in core), `present/produceStructureMarkers.ts` (take the planner's record; delete the clip read at `:80`, the skip at `:89-91` in favour of "skip a category whose value is 0", which keeps the per-category alignment rule at `:17-31`, and the exemption at `:121-127`), `@types/StructureStore.d.ts` + `load/createStructureStore.ts` (comments), delete `present/structureFadeRows.ts`; tests `produceStructureLabels.test.ts`, `produceStructureMarkers.test.ts`, `layer.test.ts`
- `tests/helpers/engine/makeFadeBridgeState.ts`; the bridge tests that import this task's deleted rows: `tests/services/engine/wiring/fadeLayers.test.ts` (galaxyCatalog, cosmicWebDensity, structure), `tests/services/engine/wiring/installFadeOnArrival.test.ts` (galaxyCatalog) and `tests/services/engine/phases/wireSlots.test.ts` (galaxyCatalog, cosmicWebDensity, milkyWay, `:131,141-142,436-438`): drop the rows from their fixtures, or the cases that existed only for them (the files that die in Task 12 need no rewrite beyond compiling)

**The galaxy mask on the handed value (V3).** PR 1 moved the mask out of core: the planner and the point pass call `sourceMaskOf(state, nowMs)` and read its `draw` or `pick` half, built from the switches and the registry. Here the Layer builds it from the `survey` record core hands it, a consumer skipping its own items at 0 (the rule Task 8's stars use), and the pick half retires with SQ2.

```ts
// src/layers/galaxyCatalog/present/sourceMaskOf.ts (PR 1's (state, nowMs) → { draw, pick } narrows to)
sourceMaskOf(fade: Readonly<Record<GalaxyCatalogId, number>>): number
  // the bit of every GALAXY_CATALOG_SOURCES code whose catalog's value is above 0; reads no state, no clock
```

- The planner computes `sourceMaskOf(fade)` once per `plan` and uses it wherever it used PR 1's `.draw` (member count, hi-res famous input, the shared disk-walk input). `DiskWalkInput.visibleSourceMask`, `HiResFamousFrameInput.visibleSourceMask` and `structureMemberCount`'s parameter keep their names and types.
- The point pass reads no mask. `GalaxyPointDrawSettings.visibleSourceMask`, the renderer's mask skip (`galaxyPointRenderer.ts:210,239-242`) and its `Omit` entry (`packGalaxyPointUniforms.ts:57,65`) go: once `fadeOpacityOf` returns `fade[id]` × the band, the renderer's exact-0 skip (`:244-250`) is the same test. `drawPick` filters `loadedSources()` on that same product being non-zero, with no mask and no registry read.
- `SourceMasks` is deleted; nothing outside the Layer ever read it.

- [ ] Migrate the four Layers. The existing `MILD_RECESSION` assertions in `produceFamousGalaxyLabels.test.ts:356`, `produceStructureLabels.test.ts:247` and `produceStructureMarkers.test.ts:193-195` must still pass unchanged in value: they are the double-recession guard (Review Focus #4).
- [ ] Behaviour change #5 lands here: delete `focused structure label is exempt from recession` (`produceStructureLabels.test.ts:250`) and `focused marker is exempt from recession` (`produceStructureMarkers.test.ts:198`), and rewrite the test header line at `produceStructureLabels.test.ts:28`.
- [ ] Behaviour change #6 lands here: a clip fade to 0 on `survey` makes the points unclickable. PR 1's `drawPick drops a catalog switched off while its fade-out runs` pinned the retired rule: rewrite it as `drawPick picks exactly the catalogs whose handed value is above 0` (`{ sdss: 0.5, twoMrs: 0, … }` → the pick renderer gets SDSS and not 2MRS, whatever the switches say). Mutation-check by restoring the switch read.
- [ ] Behaviour change #10 lands here: delete the `produceStructureLabels` tests that pinned the hand ring gate (Task 3's `a per-item of label follows its own item` replaces them).
- [ ] Test `the LOD disks take the planner's handed value` (behaviour change #12) in one of `tests/layers/galaxyCatalog/frame.*.test.ts`: hand `{ sdss: 0.25, … }` to `plan` and assert the shared input's `sourceOpacity(<sdss source>)` is 0.25 while the registry holds 1. Mutation-check by restoring the registry read.
- [ ] Test `sourceMaskOf sets a catalog's bit exactly while its value is above 0` (`sourceMaskOf.test.ts`, replacing PR 1's switch-and-registry cases): `{ sdss: 0.25, others 0 }` → only the SDSS bit. Mutation-check with `>= 0`.
- [ ] Test `the planner's walk hides a catalog whose handed value is 0` (one of the `frame.*.test.ts` files): settings on and the registry at 1, `plan` handed `{ sdss: 0, others 1 }` → the input passed to the stubbed `diskPlannerWalk.runFrame` has the SDSS bit clear and the others set. It fails if the planner rebuilds the mask from settings or the registry.
- [ ] Behaviour change #2 lands in Task 11 (the label cue's writes); nothing in this task writes settings.
- [ ] No other new test: Task 2 pins the section rule, Task 3 the per-item `of`, and Task 4 the shared draw/pick value.
- [ ] Commit.

### Task 10: Migrate the star captions, blackHoles, the missions captions and the body captions; retire core's fade rows

**Files:** `src/layers/starCatalog/layer.ts` (row `label: 'starCatalog'`), `src/layers/starCatalog/present/produceStarCaptions.ts` (both clip reads at `:69-77` go), delete `src/layers/starCatalog/present/starCatalogFadeRows.ts`; `src/layers/blackHoles/layer.ts` (row `label: 'blackHole'`), `src/layers/blackHoles/present/produceBlackHoleCaptions.ts` (the `bodyLabel` clip read at `:40` goes), delete `src/layers/blackHoles/present/blackHoleFadeRows.ts`; `src/layers/missions/layer.ts` (row `label: 'missions'`), `src/layers/missions/present/produceMissionCaptions.ts` (PR 1; its `bodyLabel` clip read goes, and each craft composes with `fade[id] × emphasisDim(craft, id)`, its own item of the handed record times the craft's emphasis; the captions keep the `meshBody` kind for its distance band and priority, but take their own entry's item, not the rule's `fadeItem`); `src/utils/labels/captionComposeContextOf.ts` (PR 1; drops `fades`); create `src/data/labels/sceneBodyCaptionLabel.ts` and `src/utils/visibility/claimedLabelItemsOf.ts` (M4, below); `src/services/engine/engine.ts` (register `produceSceneBodyCaptions` through `gateLabelProducer` with `label: SCENE_BODY_CAPTION_LABEL`, still first: `engine.ts:316-322`), `src/services/engine/presentation/produceSceneBodyCaptions.ts` (the `bodyLabel` clip read and its comment go; each caption composes with `fade[<the caption's item>]`; PR 1 already moved the Voyager emphasis out; hands the claimed set to `sceneBodyLabels`), `src/services/engine/presentation/sceneBodyLabels.ts` (PR 1's `SAMPLED_BODY_IDS` filter and import go; every body, Earth and planets included, is skipped when the claimed set holds its id; header: a Layer that claims a body captions it), `src/utils/labels/composeForegroundCaption.ts`, `src/services/engine/presentation/captionFadeRules.ts`, `src/@types/rendering/CaptionComposeContext.d.ts`, `src/services/engine/frame/passes/orbitTrailsPass.ts` (`fade: 'orbitTrails'`; the gate at `:41-46` and `resolveLayerOpacity` at `:85` go), `src/services/engine/wiring/fadeLayers.ts` (empty `FADE_LAYERS`: the body, orbitTrails and three dead rows go; `seedFades` stays until Task 12); tests `produceStarCaptions.test.ts`, `produceBlackHoleCaptions.test.ts`, `tests/layers/missions/present/produceMissionCaptions.test.ts` (its emphasis case takes a handed value; PR 1's `each present sampled craft is captioned by exactly one producer` is rewritten, below), `tests/services/engine/presentation/sceneBodyLabels.test.ts`, `tests/layers/blackHoles/sources/sgrAStar.test.ts`, `produceSceneBodyCaptions.test.ts`, `tests/utils/labels/composeForegroundCaption.test.ts`, `tests/services/engine/presentation/captionFadeRules.test.ts`, `tests/services/engine/frame/passes/orbitTrailsPass.test.ts`, `tests/services/engine/wiring/fadeLayers.test.ts`, `tests/services/engine/phases/wireSlots.test.ts` (the overlay/scaleBar handle assertions at `:600-601,607,620` go), `tests/helpers/engine/makeFadeBridgeState.ts`.

**Contract:**

```ts
// CaptionFadeRule (captionFadeRules.ts:51-57) keeps only `fadeTarget` and `fadeItem`:
//   `fadeHandle: FadeId | null` → `fadeItem: string | null` (the item inside the producing Layer's own
//   label entry: sun → 'sun', star → 'famousStar', earth → 'earth', planet → 'planet',
//   meshBody → MESH_BODY_ENTRY.id, sgrAStar → SGR_A_STAR_ID, constellation → null).
//   The `labelEnabled` axis goes: the handed value already carries the switch and its fade-out tail.
//   The `subjectVisible` axis goes (U2): the star label entry's `of: 'starCatalog'` carries "the caption
//   never outlives the dot", per item, in core; every other kind was UNGATED. `UNGATED` goes with it.
composeForegroundCaption(ctx: CaptionComposeContext, label: ForegroundCaption, fade: number): Label2D
  // `fade` is the handed per-item value (fade × recession × clip × the `of` clip). No registry read,
  // no focusRecession (`:59`), no clip parameter; the gate at `:47-50` goes entirely.
  // CaptionComposeContext drops `fades` (keep `nowMs` only if still read).

// M4: claimed body captions
// src/data/labels/sceneBodyCaptionLabel.ts
export const SCENE_BODY_CAPTION_LABEL = 'body';   // the core row's `label`, and the claim lookup's `own`
// src/utils/visibility/claimedLabelItemsOf.ts
claimedLabelItemsOf(entries: readonly VisibilityEntry[], own: string): ReadonlySet<string>
  // the `items` of every label entry whose `label` is not `own`
// produceSceneBodyCaptions: claimedLabelItemsOf(state.visibilityEntries, SCENE_BODY_CAPTION_LABEL),
//   memoised on the `state.visibilityEntries` reference (createLayers composes it once), handed to
// sceneBodyLabels(bodyStates, simDays, claimed): ForegroundCaption[]   // skips every body whose id is in `claimed`
```

**Claimed body captions (M4).** PR 1's `SAMPLED_BODY_IDS` filter in `sceneBodyLabels.ts` goes. Core's scene-body captions skip every body id that a label entry other than their own lists in its `items`: a Layer that claims a body captions it. The set derives from the composed entries (`state.visibilityEntries`), never from a hand list and never from `APP_COMPOSITION`. `own` is excluded because core's `label:body` items are caption categories, and the Earth category's id `'earth'` is also Earth's body id: counting it would drop Earth's caption. Today the missions entry (`items: SAMPLED_BODY_IDS`, Task 1) is the only claimant; no other label entry's items hold a scene-body id (verify by intersecting each entry's items with the scene body ids; if one does, STOP and report). The label name moves to `src/data/labels/` so `engine.ts`'s row and the lookup share one literal and the core-address grep (Final review mandate (d)) has no `label: 'body'` hit.

Behaviour changes #3 (the Galactic Centre caption follows `label:blackHole`) and #13 (the Voyager captions follow `label:missions` on their per-craft switch, M3) land here, as does the captions' half of behaviour change #9 (the Sun and famous-star captions fade with their star), SQ5 (the Sun's clip follows `label:starCatalog`; the `bodyLabel` link at `produceStarCaptions.ts:69-73` goes) and SQ6 (the star label entry's items are `sun` and `famousStar`).

- [ ] Test `composeForegroundCaption recedes once`: hand a value of 0.25 (full fade × MILD at blend 1) and assert `fadeAlpha` scales by exactly 0.25 against the value-1 case, not 0.0625 (Review Focus #4; mutation-check by re-adding the `focusRecession` multiply).
- [ ] Keep `produceStarCaptions.test.ts:126` (`full × MILD_RECESSION`). Its clip overrides re-key to `label:starCatalog`.
- [ ] Test `each claimed body is captioned once, by its claimant` (Review Focus #13; rewrites PR 1's `each present sampled craft is captioned by exactly one producer` in `produceMissionCaptions.test.ts`): with both tracks loaded and `visibilityEntries` composed from `APP_VISIBILITY`, the scene-body producer emits no `sceneBody-voyager1`/`sceneBody-voyager2`, `produceMissionCaptions` emits each once, and the scene-body producer still emits Earth's caption. Mutation-check three ways: drop the claim skip (a craft captioned twice), count `own` in the set (Earth's caption gone), drop the missions entry's `items` (a craft captioned twice). No separate test for `claimedLabelItemsOf`: this case covers it through its one caller.
- [ ] Delete the `captionFadeRules.test.ts` cases that pinned `subjectVisible` and `labelEnabled`: Task 3's per-item `of` test owns the behaviour now.
- [ ] Commit.

---

## Group D: vocabulary and deletion

### Task 11: One cue path over the derived vocabulary

**review: yes**: tour state, sagas, and `computeSceneEntering` must not drift from playback.

**Files:** create `src/utils/visibility/setVisibilityActionsFor.ts`, `src/utils/visibility/labelEntryFor.ts`; modify `src/@types/animation/SceneEffect.d.ts`, `src/services/engine/animation/effectHelpers.ts` (`show`/`hide`/`fade`), `src/utils/animation/expandVisibilityLayers.ts` (→ `'labels'` = every `LabelAddress` in `APP_VISIBILITY` order), delete `src/utils/animation/splitVisibilityArgs.ts` and its test, `src/services/animation/applySceneEffect.ts`, `src/state/tour/computeSceneEntering.ts`, `src/@types/engine/subsystems/ClipPlayer.d.ts`, `src/services/engine/subsystems/clipPlayer.ts`, `src/@types/animation/ClipOpacityChannel.d.ts`, `src/services/animation/clipOpacityChannel.ts` (key = `VisibilityAddress` only), `src/data/labels/labelHomeBySourceType.ts` (rows derived), `src/state/settings/projectLabelCategoryVisibility.ts`, `src/@types/settings/LabelHome.d.ts`, `src/@types/settings/LabelHomes.d.ts`, `src/compositions/selectToggleRows.ts` (the label rows' read and write path, `:30-48`, `:62-68`; #888 moved it out of the container); the U5 fix files, if the first test fails: `src/state/settings/setVisibilityAction.ts` (`overMs?`), `src/store/effects/watchFadesSaga.ts`, `src/store/effects/ReconcileEffects.ts`, `src/services/engine/wiring/makeReconcileEffects.ts`; data `src/data/animation/tours/webShowcase.ts:58`, `src/data/animation/clips/cosmicFlows.ts:77,96` (`'surveyLabel'` → `'label:famousGalaxy'`), `tools/record/README.md:244` (same rename); tests `tests/services/animation/applySceneEffect.test.ts`, `tests/services/engine/animation/effectHelpers.test.ts`, `tests/utils/animation/expandVisibilityLayers.test.ts`, `tests/state/scene/visibilityCuesWriteCapturedClusters.test.ts`, `tests/state/tour/tour.integration.test.ts`, `tests/state/tour/computeSceneEntering.test.ts`, `tests/services/engine/subsystems/clipPlayer.test.ts`, `tests/data/labels/labelHomeBySourceType.test.ts`, `tests/state/settings/projectLabelCategoryVisibility.test.ts`, `tests/data/animation/tours/webShowcase.test.ts`, `tests/components/containers/LabelsAndGuidesSectionContainer.test.ts`, `tests/compositions/selectToggleRows.test.ts`, `tests/store/effects/watchFadesSaga.test.ts`, `tests/services/engine/wiring/makeReconcileEffects.test.ts`.

**Contract:**

```ts
show(args: readonly (VisibilityArg | ScopedVisibilityAddress)[], over?: number)
hide(args: readonly (VisibilityArg | ScopedVisibilityAddress)[], over?: number)
fade(args: readonly VisibilityArg[], to: number, over: number)
// SceneEffect show/hide: { args: readonly (VisibilityAddress | ScopedVisibilityAddress)[]; over? }
//   ('labels' expanded at construction). One list: the `layers`/`scoped` split goes (SQ4).
setVisibilityActionsFor(settings: EngineSettingsState, arg: VisibilityAddress | ScopedVisibilityAddress,
                        on: boolean, overMs?: number): readonly SetVisibilityAction[]
  // item-less entry → one action on its field.
  // bare per-item SHOW address → hasSectionSwitch ? one action on the section switch : one per item.
  // bare per-item LABEL address → one per item (labelEnabled; a label cue never writes `enabled`).
  // scoped → one action on that item. `settings` is read only through hasSectionSwitch.
  // `overMs` is copied onto every action (U5 fix only; omit the parameter otherwise).
labelEntryFor(category: LabelCategory): LabelEntry
  // the label entry whose items include the category, else the item-less entry whose `label` equals it (milkyWay)

// U5 fix only (the first test below fails on today's code):
setVisibility payload gains   overMs?: number   // ms; 0 = snap; absent = default durations; the reducer ignores it
ReconcileEffects.syncFades: (opts?: { overMs?: number }) => void
  // widened parameter, no new member. overMs === 0 → animate: false; > 0 → durationMs: overMs.
watchFadesSaga: a `setVisibility` action passes its payload's overMs to syncFades; other settings writes pass none.
```

`applySceneEffect` and `computeSceneEntering` both call `setVisibilityActionsFor`, so the fold cannot drift from playback (`computeSceneEntering.ts:1-11`). Every arg (bare, scoped, label) takes the one path and honours `over` (behaviour change #7). Which path depends on the first test:

- **It fails (U5 ruled):** the duration travels with the write. `applySceneEffect` dispatches the actions with `overMs = over * 1000` and keeps no explicit sync: the reactive sync is the only sync. The `targetOf` short-circuit keeps siblings' ramps.
- **It passes:** nothing above under "U5 fix only" lands. `applySceneEffect` dispatches, then syncs each arg's address (a scoped arg syncs its entry's address) with `durationMs: over * 1000` and `animate: over !== 0`. Report in your reply that the reading under Review Focus #10 was wrong.

`labelHomeBySourceType`'s read/write rows become `labelEntryFor` + `visibilitySwitchOf` / `setVisibility`. Keep `LabelHomes` as stable per-cluster references (its header's memo reason) and key it by cluster. Behaviour change #2 (the famous-galaxy label cue writes only `famousGalaxy`) and SQ6 (the star label cue writes only `sun` and `famousStar`) fall out of the entries' item lists.

**Shipped bare per-item cues (behaviour change #8):** `hide(['survey'], 8)` (`grandTour/cosmicWeb.ts:92`) and the opening hide of `'survey'` and `'structureRing'` (`grandTour/openingTitle.ts:51-60`) still write every item, because `galaxyCatalogs` and `structures` have no section switch. `'cosmicWebDensity'` (`grandTour/cosmicWeb.ts:64`, `openingTitle.ts:53`, `webShowcase.ts:58`, `cosmicFlows.ts:77`) writes the section switch, which is what it writes today. No shipped cue addresses the new `starCatalog` key or `missionTrails` (the Voyager exhibit turns its trails on through its settings snapshot, `voyagerMissions.ts:51-52`). No shipped bare cue changes meaning.

**Shipped `'labels'` cues (behaviour change #4):** the one cue is `hide(['labels'], 0)` in `clips/makers/makeEarthLoop.ts:77`, used with `hideLabels: true` only by `clips/earthCosmicWebLoop.ts:14`. The zone of avoidance boots on, so that clip now also hides the ZoA lettering. Constellations and light-time spheres boot off. The tools' screenshot declutter (`tools/utils/capture/sceneDeclutterActions.ts`, `labelDeclutterActions`) is its own hand list and is out of scope.

- [ ] **First, the deciding test (Review Focus #10, U5):** `a cue's over reaches the fade through the live saga`, in `tests/state/tour/tour.integration.test.ts` or a sibling. It uses a real store with the root saga and a `reconcile` context whose `syncFades` runs the real sync over a real fade registry. `applySceneEffect(show(['flow'], 9))` must leave the flow identity mid-ramp at 4.5 s, not settled at 1. Add a second case: `hide(['flow'], 0)` leaves the identity at 0 at once. Run both on today's code first and record the result in your reply, then take the matching path above. On the fix path, mutation-check by dropping `overMs` in `watchFadesSaga`: both cases must fail.
- [ ] Rewrite `visibilityCuesWriteCapturedClusters.test.ts` as `every entry's cluster is captured by the tour snapshot`.
- [ ] Test `'labels' expands to every label address`: compare as a set against `APP_VISIBILITY`'s label entries (grill Q4: order is not a contract).
- [ ] Test `a bare per-item show address writes the section switch where the cluster has one`: `cosmicWebDensity` and `starCatalog` → one action on the section switch; `survey` and `structureRing` → one per item. Mutation-check by always fanning out.
- [ ] Test `every label category resolves to exactly one label entry` (iterate `LABEL_CATEGORIES`). Keep the round-trip `read-after-write for every label-bearing category` through the real reducer.
- [ ] Type-level lines in `effectHelpers.test.ts`: `// @ts-expect-error` on `hide(['flwo'])`, `show(['label:structure:bogus'])`, `fade(['survey:bogus'], 0, 1)`.
- [ ] Commit.

### Task 12: Delete the old tables, bridges and vocabulary

**Files (delete):** `src/@types/animation/{FadeId,FadeLayer,OverlayId,VisibilityLayerKey,VisibilityLayerArg,ScopedVisibilityArg,LabelLayerId}.d.ts` (`LabelLayerId`'s last users are `FadeId`, `fadeIdToVisibilityKey` and `focusRecession`'s tables), `src/data/animation/visibilityLayerRows.ts`, `src/services/animation/{visibilityActionRow,scopedVisibilityActions}.ts`, `src/services/engine/presentation/fadeIdToVisibilityKey.ts`, `src/services/engine/wiring/{fadeLayers,installFadeOnArrival,syncVisibilityFades}.ts`, `src/utils/animation/fadeLayerRow.ts`, `tests/helpers/engine/{makeFadeBridgeState,FadeBridgeState}.ts`, `tests/services/engine/wiring/{fadeLayers,installFadeOnArrival,syncVisibilityFades}.test.ts`, `tests/services/animation/scopedVisibilityActions.test.ts`.
**Files (modify):** `src/@types/animation/FadeRegistry.d.ts` + `src/services/animation/fadeRegistry.ts` (`FadeIdentity` only; `serializeFadeId` → `fadeIdentityKey`), `src/services/engine/presentation/focusRecession.ts` (only `STRONG_RECESSION`, `MILD_RECESSION` and `recessionFactor` remain; `resolveLayerOpacity` and both tables, `:27-62`, go), `src/layers/missions/state/missionTrails/slice.ts` (PR 1; delete `setMissionTrailsEnabled`: its last reader, `visibilityActionRow.ts:59`, goes in this task, and the slice keeps no reducer, since `setVisibility` writes the cluster), `src/@types/engine/layer/{Layer,LayerInstance,LayerCoreDeps}.d.ts` (drop `fades`), `src/services/engine/layer/instantiateLayer.ts`, `src/@types/engine/state/EngineState.d.ts` (drop `fadeRows`), `src/services/engine/engine.ts`, `src/services/engine/phases/{createLayers,wireSlots}.ts`, `src/services/engine/wiring/makeReconcileEffects.ts`, `src/store/effects/ReconcileEffects.ts` + `watchFadesSaga.ts` (comments), `src/layers/*/create.ts` and `src/layers/galaxyCatalog/load/wireGalaxyCatalogSourceSlot.ts` (header lines naming `installFadeOnArrival`, if any survive), `tests/helpers/conventions/inlineTypeFiles.ts` (drop deleted paths), `tests/services/animation/fadeRegistry.test.ts`, `tests/services/engine/presentation/focusRecession.test.ts` (drop the `resolveLayerOpacity` block), every test still importing a deleted symbol (let `npx tsc --noEmit` list them). Also the comments naming deleted symbols in `src/@types/engine/handles/EngineSubsystemHandles.d.ts`, `src/@types/rendering/FlowFieldRenderer.d.ts`, `src/services/gpu/renderers/volumeField/volumeFieldRenderer.ts:330-334`, `src/layers/README.md` (the `fades?` row and the "never drives a fade" rule → `visibility`), `docs/animation/clip-primitives.md` (`:333-355` vocabulary, including "a custom `over` applies to the atomic layers only"), `docs/tour/implementation-notes.md:70`, `tools/record/README.md:244`.
**Backlog:** delete the `docs/BACKLOG.md` lines "Bundle-declared fade rows — does union totality…" and "A new Layer's fade row touches 6 hand-kept tables", plus `docs/backlog/2026-08-20-fade-row-totality-question.md`.

- [ ] Delete, narrow, and sweep. Grep `src tests tools docs/animation docs/tour src/layers/README.md` for every deleted symbol name; the only hits left may be in `docs/research/`, `docs/grill-sessions/` or `docs/audits/` (history).
- [ ] Deleting tests that only restated a table is a deliverable: no replacement test.
- [ ] `npx tsc --noEmit` passes.
- [ ] Commit.

---

## Definition of Done

**Deliverables**
- [ ] `visibility.ts` in each of the 14 Layers (missions included); the body Layer (PR 1's `layer.ts`) declares `visibility` and the Orbit trails `ui` row; `APP_VISIBILITY` in `src/compositions/appVisibility.ts`; `ShowKey`, `LabelAddress`, `VisibilityAddress`, `ScopedVisibilityAddress`, `VisibilityArg`, `FadeIdentity` derived from it.
- [ ] One density entry (`cosmicWebDensity` with items); one star show entry (`starCatalog` with items); the missions show entry on the `missionTrails` cluster and its per-craft `label:missions` entry (`items: SAMPLED_BODY_IDS`, switch `missions.items.<craft>.labelEnabled`); label entries with `of` for constellations, lightTime and zoneOfAvoidance (with a new `labelEnabled` switch), structure (`of: 'structureRing'`) and starCatalog (`of: 'starCatalog'`).
- [ ] `setVisibility` handled in `settingsReducer.ts`; the section rule written once in `visibilitySwitchOf`.
- [ ] `AssetWiringRow.gates` on the seven gating Layers (star survey rows included); `fade` on passes and planners; `label` on every label producer row (no other form), `produceMissionCaptions` included; `visibilityLiveOf` as the one liveness predicate, used by the producer skip; `labelsAndGuides` toggle rows in the `{ slot, content }` shape, Mission trails and Orbit trails included, built in `selectToggleRows`.
- [ ] One sort over every scene body: each seed record carries its own `resolvePx`; the star show entry declares `bodies: SEEDED_STAR_CATALOGS`; `ReadyFrameContext.sceneBodies` (every admitted body, positioned once per frame, admitted on a handed value above 0) in place of `positionedStars`; `partitionBodiesByPresentation` splits it into `unresolved` and `resolved`, and each pass takes its own bodies by its own data; `visibleStars`, `positionedVisibleStars`, `partitionStarsByResolution` and `resolvesToSphere` gone; `STAR_RESOLVE_PX` and `BODY_GLINT_MAX_PX` in `src/data/bodies/`; no contract member beyond `ShowEntry.bodies` and `ReadyFrameContext.sceneBodies` (both consented); the NEAR0 range rule as ruled for Task 7's open question.
- [ ] `sourceMaskOf(fade)` in `src/layers/galaxyCatalog/present/`, called only by the galaxy planner on its handed `survey` record; `SourceMasks` gone.
- [ ] Both sphere passes draw with their catalog's handed value (PR 1's opacity slot and blend).
- [ ] Claimed body captions (M4): `claimedLabelItemsOf` and `SCENE_BODY_CAPTION_LABEL` exist; `sceneBodyLabels.ts` names no `SAMPLED_BODY_IDS`; core's body captions skip exactly the ids other label entries claim.
- [ ] The core-address grep in Final review mandate (d) returns only its one allowed hit (`orbitTrailsPass`'s `fade: 'orbitTrails'`). A grep, not a ratchet test: a cheap literal scan drowns in selection kinds and source types that share the key names (`'body'` alone has 57 core hits today), and a precise one needs the type checker over the whole project to catch an architecture regression, not a runtime bug, that review mandate (b) already checks.
- [ ] Gone: everything the spec's "Deleted" lists that is not marked (prep), every `*FadeRows.ts` (`missionTrailsFadeRows.ts` included), `FADE_LAYERS`, the five `*SettingsRow.ts` (`missionTrailsSettingsRow.ts` included), `selectMissionTrailsEnabled` and `setMissionTrailsEnabled`, `LayerSettingsRow`, the hand-authored Orbit trails row, the focused-structure exemption, the structure label's ring gate, the star section ANDs and `CaptionFadeRule.subjectVisible`, the "pick follows intent" rule, `SourceMasks`, `GalaxyPointDrawSettings.visibleSourceMask`, `splitVisibilityArgs`, `LabelLayerId`, and both backlog items.
- [ ] The final review's cross-Layer table, with every known leftover marked.
- [ ] Task 11's reply states whether the live-saga test failed on today's code and which cue path landed.

**Manual smoke** (worktree server; before/after against main for each visual item)
- [ ] Labels & guides panel (`#focus=body-earth`): toggling Local Bubble, Constellations, Light-time spheres, Zone of Avoidance, Mission trails and Orbit trails each fades out and back in, never pops (Mission trails at `#exhibit=voyager-missions`, where the craft are present); the S-star trails at `#focus=blackhole-sgr-a-star` obey Orbit trails. Turning Constellations off fades the names with the lines. Orbit trails is the last row (behaviour change #11).
- [ ] Label toggles in the same panel (famous galaxy, a structure category, famous stars, Sun, Earth, Galactic Centre, Mesh bodies) fade their captions. At `#focus=m31`, focusing a structure recedes every structure label and ring, the focused one's included (behaviour change #5).
- [ ] Voyager captions (behaviour change #13) at `#exhibit=voyager-missions`: the emphasis dim holds (Voyager 2's caption dimmed while Voyager 1 is the selected craft); turning Mesh bodies off leaves the Voyager captions shown while Earth, the planets and the other mesh bodies keep their core captions (each Voyager name drawn once); `#clip=earthCosmicWebLoop`'s `hide(['labels'])` still covers them.
- [ ] Stars (behaviour change #9): at `#focus=body-earth`, turning the Stars master off fades the point stars, the Gaia field and the Sun and famous-star captions out together; on fades them back in. Turning Famous stars off alone fades only those stars and their names. A cold load fades the Gaia field in as it arrives.
- [ ] Star spheres (behaviour change #9, V1): a before/after pair (main vs branch) at `#focus=star-sun`, close enough that the Sun is a resolved sphere. Turning the Stars master off fades the sphere out over the default duration (main: it vanishes at the toggle); on fades it back in. At rest the sphere looks the same as on main. Repeat for the field-star sphere by flying down onto a Gaia star until its sphere resolves, then turning Gaia stars off. Watch for a darker dip mid-fade (the composite's `a²` ramp, Task 8); report it rather than tuning.
- [ ] Structure labels (behaviour change #10): at `#focus=m31`, turning a structure category's rings off fades its labels out alongside the rings instead of holding them at full opacity until the rings are gone.
- [ ] Local Bubble (behaviour change #1): from `#focus=body-earth`, zoom out past 40 kpc and back. The shell fades in on return instead of popping.
- [ ] `#tour=grandTour`: the You-are-here beat reveals the Milky Way label over its authored 1 s; the deep-field beat reveals Milliquas over 6 s; the cosmic-web beat brings the density in over 9 s; the Virgo approach swaps structure rings at their authored pace (behaviour change #7).
- [ ] `#clip=cosmicFlows`: the opening cue snaps the cosmic web and famous-galaxy labels off; during the survey dim, galaxy points cannot be clicked once they reach 0 (behaviour change #6) and no LOD disk is in view (behaviour change #12); the closing fade-to-black dims flow, the disk, structure rings, any structure labels and famous labels together (behaviour change #10).
- [ ] `#clip=earthCosmicWebLoop`: the zone-of-avoidance lettering is hidden with the other labels (behaviour change #4).
- [ ] A cold load at `#focus=m31` fades the default catalogs in as they arrive. Switching to the small tier and back does not restart a sibling catalog's ramp.

**Deferral boundary:** richer panels (galaxy catalogs, stars, structures) keep their own setters. Bodies moving out of core into Layers (each Layer contributing its body rows as data, like `Layer.slabs`) is the last Layer refactor PR, after this one; it adds a per-body slab field and deletes this PR's `near0SphereBodies` leftover (T7-5). Also out of scope, unruled: mesh picking uses the bounding sphere, and captions are never occluded by mesh bodies. Body render/load code stays in core (its `orbitTrailsPass` is the core-address grep's allowed hit; the scene-body caption row's label is `SCENE_BODY_CAPTION_LABEL` in `src/data/labels/`). `starSphereRangeM` and `slabs.ts`'s `starSphereRangeM` input keep their names. The `foreground:0 → hdr` composite stays straight-alpha OVER. Layer-owned scale fade bands are a separate item. The heliosphere Layer is the feature PR. A general "the focused subject never recedes" rule and "every label follows its thing" (Milky Way, famous galaxy, body, black hole and missions labels) are later PRs. The new `labelEnabled` switches (`missions.items.<craft>` included) get no panel rows. The tools' own declutter lists are untouched. Asset `demand` predicates keep today's load policy. Everything PR 1 delivered is not redone here.
