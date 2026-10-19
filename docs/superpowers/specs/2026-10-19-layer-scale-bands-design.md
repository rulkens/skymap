# Layer-declared distance bands

## Goal

Each Layer declares where its content is visible as named distance windows on its `visibility` entries. Core measures the camera distance, multiplies the window into the value it already hands every per-view consumer, and skips at 0, so draw, pick and the label producer skip all follow the band. No Layer measures a camera distance, looks a row up in core's table, or culls on a band by hand.

Rationale and every ruling: `docs/grill-sessions/layer-scale-bands-2026-10-18.md` (Q1-Q12, rulings B1, S1, B3, R1, C1, O1, K1, D1, E1, V1). Built on ADR 0012 (#912): this extends "Layers declare visibility; core hands one value" from toggles to distance.

**Scope (S1):** kind 1 only, the camera's distance from a fixed point. Kind 2 (each label's own distance: the star, Sun and Sgr A\* names) and kind 3 (apparent size in px: famous-galaxy labels, structure rings' min-size fade, body glint, `milkyWayFadeAlpha`) stay as they are and go to a "per-subject fades" backlog item. The shape below takes either as one new tag, not a reshape.

## The flow

```
visibility.ts entry.bands ──► core, per FrameView:  d = |drawCamPos − anchor(from)|
                                                 band(item) = Π over the bands that apply to item
                                                             (in: smoothstep(in0, in1, d), out: 1 − smoothstep(out0, out1, d))
handed value(item) = fade × clip × band(item)      [× the `of` entry's clip and bands, for a label with `of`]
   passes:          skip while every item is 0 (unchanged rule), value to draw and pick
   perView planner / compute: value as the last argument (unchanged)
   once planner / compute:    fade × clip only (no band: one plan serves several views)
   label producers: skip when not live (raw, unchanged) OR every item's band is 0 (K1)
```

## Contracts

### `EntryBand` (new, `src/@types/engine/layer/EntryBand.d.ts`)

```ts
import type { BodyRegionId } from '../../data/BodyRegionId';

/** One named distance window on a visibility entry, measured on the camera's distance from
 *  `from` (omitted: the render origin, where the Sun sits). Edges are Mpc in increasing
 *  distance; an omitted edge is full on that side. */
export type EntryBand = {
  /** Fades in as the distance grows: 0 at `in[0]`, full at `in[1]`. */
  readonly in?: readonly [number, number];
  /** Fades out as the distance grows: full at `out[0]`, 0 at `out[1]`. */
  readonly out?: readonly [number, number];
  readonly from?: BodyRegionId;
  /** The entry's items this band applies to; omitted = every item (or the entry). */
  readonly items?: readonly string[];
};
```

### `VisibilityEntryCommon.bands` (new optional member, consented in B2/B3)

```ts
/** Named distance windows; an item's band value is the product of those that apply to it. */
readonly bands?: Readonly<Record<string, EntryBand>>;
```

Rules, each checked in `tests/compositions/appVisibility.test.ts` over `APP_VISIBILITY` (the `of` rule's home; `appVisibility.ts` itself checks types only, at `:45`):

- every `in` and `out` is ascending, and when both exist `in[1] ≤ out[0]`;
- a band's `items` are a subset of its entry's `items`, and a band on an item-less entry has no `items`;
- an entry with `bodies` declares no `bands` (core's scene-body admission, `frameContext.ts:121-133`, runs once per frame with no view; no entry needs both today).

### Resolution

- `bandValueOf(entry, item, view)` in `src/services/engine/presentation/`: the product over the entry's bands whose `items` include `item` (or that have none), each `in`/`out` term a `smoothstep` (the curve `fadeBand` uses today). The anchor: omitted `from` = `view.drawCamPos` length; a region id = `regionRelativeDistanceMpc(view.drawCamPos, regionById(from), sceneBodyStates(state, view))` (an unresolved anchor is `Infinity`).
- For a label entry with `of`, the label's band value also multiplies its `of` entry's band value for the same item (O1), as its clip already does (`resolveVisibilityOpacity.ts:23-24`).
- `resolveFadeValue(state, snapshot, address)` stays as is (fade × clip) for the once-scope callers and scene-body admission. A new `resolveViewFadeValue(state, view, address)` returns that value × the band value per item, for every per-view caller (`gatePassByFade`, the perView branches of `gatePlannerByFade` and `gateComputeByFade`, both label gates). Memoised per `FrameView` and address (`gatePassByFade` calls it up to four times per pass per frame).
- `gateLabelProducer` and `gateWorldLabelProducer` skip when `!labelLiveOf(...)` (unchanged) or when every item's band value is 0 (K1). Clip stays out of the skip (#912 landmine: a clip at 0 must not cut a switched-off label's fade-out tail).

### Kinds 2 and 3, later

Kind 2 adds `from: 'anchor'` on label entries only, evaluated per label in the director loop (`label2DDirector.ts:789-793`), which needs one camera-relative label frame first (grill Q3, L1). Kind 3 adds a measurement tag on the band (apparent px) and, because it varies per subject inside an item, hands the consumer the band's edges rather than a resolved number. Both are the "per-subject fades" backlog item.

## Per-Layer entries

Edges are copied from today's rows (`scaleFadeBands.ts`); `in` is an approach row (`fullAt > goneAt`) as `[goneAt, fullAt]`, `out` is a recede row as `[fullAt, goneAt]`.

| Entry                       | Bands                                                                                                                                                     | Was                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `localBubble`               | `shell: { in: [0.4 kpc, 1 kpc], out: [4 kpc, NEIGHBOURHOOD_RECEDE_KPC] }`                                                                                 | `localBubble` × `localBubbleRecede` in `localBubbleOpacity.ts:16`        |
| `constellations`            | `neighbourhood: { out: [1 kpc, NEIGHBOURHOOD_RECEDE_KPC] }`                                                                                               | `constellationsBand.ts`                                                  |
| `label:constellations`      | inherits via `of`                                                                                                                                         | `produceConstellationCaptions.ts:63`                                     |
| `zoneOfAvoidance`           | `veil: { in: [2 R, 10 R], out: [2, 6] }` (R = `MILKY_WAY_RADIUS_MPC`)                                                                                     | `deriveZoneOfAvoidanceLiveness.ts:21-24`                                 |
| `label:zoneOfAvoidance`     | inherits via `of`                                                                                                                                         | `produceZoneOfAvoidanceLettering.ts:34`                                  |
| `milkyWayDisk`              | `approachSun: { in: [0.0002, 0.002] }`, `approachCentre: { from: 'galactic-centre', in: [0.0006, 0.012] }`                                                | `milkyWayCloudLiveness.ts:40-43` (by min; now product, C1)               |
| `label:milkyWay`            | `youAreHere: { in: SURVEY_DEEP_ZOOM.in, out: [0.6, 2] }`                                                                                                  | `produceMilkyWayLabel.ts:31,52` (`MILKY_WAY_LABEL_FADE_BAND` × deepZoom) |
| `survey`                    | `deepZoom: { ...SURVEY_DEEP_ZOOM, items: SURVEY_IDS }` (`SURVEY_IDS` = `GALAXY_CATALOG_IDS` without `famousGalaxy`)                                       | `galaxyPointSpritesPass.ts:37-38,72`                                     |
| `structureRing`             | `cosmic: { ...SURVEY_DEEP_ZOOM, items: STRUCTURE_IDS_BY_SCALE.cosmic }`, `milkyWayPlaces: { out: [2 R, FOREGROUND_MAX_DISTANCE_MPC], items: STRUCTURE_IDS_BY_SCALE.milkyWay }` | `StructureMarkerStyle.visibleBand`                                       |
| `label:structure`           | inherits via `of`                                                                                                                                         | `produceStructureLabels.ts:51,82`                                        |
| `cosmicWebDensity`          | `deepZoom: SURVEY_DEEP_ZOOM`                                                                                                                              | `VolumeFieldSettings.bands` (D1)                                         |

Shared values (E1, V1): `src/data/bands/surveyDeepZoom.ts` (`SURVEY_DEEP_ZOOM = { in: [0.002, FOREGROUND_MAX_DISTANCE_MPC] }`) and `src/data/bands/neighbourhoodRecedeKpc.ts` (`NEIGHBOURHOOD_RECEDE_KPC = 10`). Single-Layer edges stay in the Layer's `visibility.ts`.

Consumers of these entries stop measuring, applying and culling on the band: `constellationsPass.ts:27,37`, `produceConstellationCaptions.ts:63`, `localBubblePass.ts:23-33`, `zoneOfAvoidancePass.ts:20,26,47` and `zoneOfAvoidanceUpsamplePass.ts:20` (through `deriveZoneOfAvoidanceLiveness`), `milkyWayPass.ts:53,58,64`, `milkyWayAggregatePass.ts:27,31`, `milkyWayUpsamplePass.ts:22` (through `deriveMilkyWayCloudAlpha`, which keeps `milkyWayFadeAlpha` and emphasis), `produceMilkyWayLabel.ts:43-56`, `galaxyPointSpritesPass.ts:37-38,72,79-86`, `createStructureMarkersPass.ts:15-53` (the marker passes declare `fade: 'structureRing'`), `produceStructureMarkers.ts:66,83,111,123`, `produceStructureLabels.ts:50-52,82,114`, `deriveVolumeLiveness.ts:25-29`.

## Pass-owned dissolves (R1)

A dissolve that belongs to one render path is not a visibility band. `starBackdrop` (dims only `starPointsPass`, `:131-136,156-159`; on the entry it would drop seeded stars from scene-body admission) moves to `src/layers/starCatalog/data/starBackdropDissolve.ts` and stays applied by the pass with `fadeBand`. Core's `bodyGlintBackdrop` stays core's.

## Core's remaining table

`SCALE_FADE_BANDS` keeps only core's rows (`starCaption`, `sunCaption`, `sgrAStarCaption`, `bodyGlint`, `bodyGlintBackdrop`, `sgrAStarLensing`, `solarSystemSky`) and moves to `src/data/` with its anchor constants (E1). `FadeBand` and `fadeBand` stay for those rows and the pass-owned dissolve.

## Deleted

- The ten Layer rows of `SCALE_FADE_BANDS` (`surveyDeepZoom`, `milkyWayApproachSun`, `milkyWayApproachGc`, `starBackdrop`, `constellations`, `milkyWayStructures`, `zoneOfAvoidance`, `zoneOfAvoidanceRecede`, `localBubble`, `localBubbleRecede`).
- `constellationsBand.ts`; the band term of `localBubbleOpacity.ts`, `deriveZoneOfAvoidanceLiveness.ts` and `deriveMilkyWayCloudAlpha`; `MILKY_WAY_LABEL_FADE_BAND`; the survey fade and its famous ternary in `galaxyPointSpritesPass.ts`.
- `StructureMarkerStyle.visibleBand`, `STRUCTURE_VISIBLE_BANDS_BY_SCALE` (`structureVisibleBands.ts`), and `anyFadeBandVisible` if nothing else reads it.
- `VolumeFieldSettings.bands`, its seed (`cosmicWebDensity/state/defaults.ts:21`), its pass-through in `clampVolumeFieldSettings.ts:13` and `bandFactor` in `deriveVolumeLiveness.ts`.
- The backlog items `2026-09-19-layer-owned-scale-fade-bands.md` and `2026-08-31-scale-fade-bands-to-data.md` and their index lines.

## Uniformity

- No consumer measures a camera distance for a visibility band; core does, in one function.
- A band on an entry applies to every per-view consumer of that entry, pick and skip included (R1). One-render-path dissolves are pass data and say so.
- An item's value is one product (C1); there is no combine mode.
- Labels with `of` follow their show entry's bands as they follow its clip (O1).
- No core code names a band, a Layer or an entry.

## Behaviour changes

1. **The Milky Way disk near the Sun (C1).** Its two approach bands multiply instead of taking the min, so inside 2 kpc of the Sun it is 20-40% dimmer (1 kpc out: 0.42 → about 0.26-0.35). Outside 2 kpc nothing changes. Gate: a before/after pair at 1 kpc and 0.5 kpc from the Sun; if it reads worse, retune `approachSun`'s edges (data only).
2. **Structure marker passes skip through core.** They declare `fade: 'structureRing'` and skip when every item of the entry is 0, instead of testing their own scale's bands. A pass's own `enabled` still narrows to its scale's items. No visible change expected.
3. **Label producers skip at band 0 by core's rule (K1)** instead of their own early returns. Same output.

Survey, density, constellations, Local Bubble, ZoA and structure labels are value-identical: the same edges and the same curve, moved.

## Tests

- `bandValueOf`: an `in` window at its edges (0 at `in[0]`, 1 at `in[1]`, smoothstep between); an `out` window; both together; `items` restriction (an item outside a band's `items` gets 1 from it); `from: 'galactic-centre'` measures from the region anchor; an unresolved anchor gives the `in` limit at `Infinity`.
- The resolver: handed value = fade × clip × band for a per-view caller; a label with `of` multiplies its show entry's bands item for item; a once-scope caller gets no band.
- `gateLabelProducer`: a live producer whose every item's band is 0 is not called; one at band > 0 and clip 0 is still called (the #912 pin stays).
- `appVisibility.test.ts`: the three rules above.
- The Milky Way disk's product is pinned once in `milkyWayCloudLiveness.test.ts` or its successor (at 1 kpc from the Sun the value is the product, not the min).
- Tests that pin moved values by row name (`scaleFadeBands.test.ts`, the Layer tests listed in the plan) move with the values or are deleted when they only pin a constant.

## Ground preparation

Ideal diff: a `bands` member on `VisibilityEntryCommon`, one resolver function in core, and data rows in eleven entries. Verdicts:

- **Entry rows: growth.** `visibility.ts` already holds per-entry data; bands are more of it.
- **Core resolution: growth.** `resolveFadeValue` and the gates are the seams #912 built; the band is one more factor at the one place the value is made.
- **Shared band values: bolt-on today.** `src/data/bands/surveyDeepZoom.ts` would have to import `FOREGROUND_MAX_DISTANCE_MPC` from `services/engine/frame/`, and the ZoA and Milky Way places edges need `MILKY_WAY_RADIUS_MPC` from `galaxyGenerator/v1/`, which is slated for deletion. **Prep E1:** move `FOREGROUND_MAX_DISTANCE_MPC`, `SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC` and `MILKY_WAY_RADIUS_MPC` to `src/data/`, then `scaleFadeBands.ts` to `src/data/` (the absorbed backlog item `2026-08-31-scale-fade-bands-to-data.md`). Pure moves with `npm run move-files`; behaviour-neutral.
- **The label frame (L1): not needed for kind 1.** Kind 1 never reads a label's position. L1 is the joint kind 2 needs and becomes the first prep of the "per-subject fades" item.

Greenfield cross-check (a fresh agent given only the requirements) agreed on the product, label inheritance through the show entry, a camera-only band, and future kinds as a tag on the band. It diverged on three points, each kept as ruled: one central edge table (rejected by the brief: each Layer declares its own bands; shared edges get named constants in `src/data/bands/`), per-item `fadeGroup` tags (would reshape #912's `items` string list in 14 files; `items` on the band does the same), and direction from edge order (ruled `in`/`out`).

## Out of scope

- Kinds 2 and 3 (per-subject fades) and the label frame unification (L1): one backlog item.
- A live band debug panel: backlog.
- Converting core's own rows to `in`/`out`.
- `FadeBand` and `fadeBand` stay.
