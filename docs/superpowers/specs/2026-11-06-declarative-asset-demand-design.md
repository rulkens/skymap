# Declarative asset demand, then scale gates

**Status:** approved shape (2026-11-06 rulings, asks bsYY, Ez6u, kw33). Two PRs after the release-hook prep.
**Branch:** `worktree-optimize-gpu-loaded-data` (migration PR); the gates PR follows on its own branch.

## Why

At Earth the GPU holds data nothing draws: the Søndermarken mesh (its 1e5-radii gate is 16,000 km, wider than
Earth), Venus's surface (1e4 radii ≈ 0.4 AU, and Venus sits near inferior conjunction), the Moon's surface, and
every survey galaxy catalog plus the MCPM volume (no scale term at all, ~68 MB at the medium tier). Each gate is
a hand-written `demand(ctx)` / `release(ctx)` pair, and several restate facts the Layer already declares:
localBubble copies its band edge as `0.02`/`0.04` Mpc literals (`localBubbleAssetRows.ts:10-11`), and satellites
re-implements the band's `from: SCENE_EARTH.id` distance (`satellitesAssetRows.ts:25-27`). Move a band, and the
fade and the fetch disagree with no test noticing.

The fix is in two steps: demand becomes data that the Layer declares and core evaluates; then the new gates
(apparent size, band approach, overrides) are added as data on that shape.

## Ground preparation

1. **Release-hook prep — own PR, in flight** (branch `prep/gated-slots-release-gpu`). Four gated slots have no
   `onRelease` (cosmicWebDensity, cosmicWebFilaments, flow, constellations), so a band release would strand
   their VRAM and refetch. Each gains one.
2. **`bandDistanceMpc` extracted** (first commit of the migration PR). `distanceFrom` + the origin `hypot` move out
   of `bandValueOf.ts:19-34` into `src/services/engine/presentation/bandDistanceMpc.ts`, taking
   `(band, camPosMpc, bodyStates)`, so the fade and the demand evaluator share one distance measure.

The migration PR is itself the joint the gates PR needs. Verdicts from the refactor-ground pass:

- the band term: core reads it (growth);
- the overrides: data, `alsoWhen` (growth);
- the size gate: data, `size` (growth);
- localBubble's literal gate: deleted (it was the existing bolt-on).

## The shape

```ts
// src/@types/loading/AssetDemand.d.ts
export type AssetDemand =
  | 'always'
  | 'whenSearching'
  /** What `expandCompanionRows` emits: demanded once the parent leaves `idle`, never released. */
  | { readonly companionOf: AssetKey }
  | {
      /** Omitted: the row's `gates`. An address alone means any of its items (or its own switch if itemless). */
      shown?: VisibilityAddress | { readonly address: VisibilityAddress; readonly items: readonly string[] };
      /** The label switches of `shown`'s items count as shown too (structure catalog). */
      labelsCount?: true;
      /** Tiers that ship this file; outside them the row never demands and releases a resident copy. */
      tiers?: readonly Tier[];
      near?: NearGate;
      size?: SizeGate; // gates PR
      /** Lift the scale gates (never the switch or tier). `selected` reads `shown`'s entry `selects`. */
      alsoWhen?: readonly ('searching' | 'selected')[];
    };

// src/@types/loading/NearGate.d.ts — one band edge of `shown`'s entry, measured from `band.from`.
// 'out': load within out[1]·lead, release beyond out[1]·release. 'in': load beyond in[0]/lead, release below in[0]/release.
// 'both' (PR B): both tests at once — load only inside both load limits, release past either release limit.
export type NearGate = { readonly band: string; readonly edge: 'in' | 'out' | 'both'; readonly lead: number; readonly release: number };

// src/@types/loading/SizeGate.d.ts — gates PR. Apparent diameter on the largest drawing view.
export type SizeGate = { readonly body: SceneBodyId; readonly loadPx: number; readonly releasePx: number };
```

`AssetWiringRow.demand: (ctx) => boolean` and `release?` become `demand: AssetDemand`. `DemandCtx` stays as core's
input to the one evaluator, `src/services/engine/wiring/evaluateAssetDemand.ts` → `{ demand, release }`, which
`reevaluateDemand` calls once per row per pass (replacing its three `row.demand(ctx)` reads and one `row.release`).

> [!DECISION] `edge` is explicit, not inferred
> PR A keeps localBubble on its out edge only, as main had it. The owner's smoke check found the bubble loaded at Earth,
> where its `in: [0.4, 1] kpc` edge draws nothing, so PR B moves it to `edge: 'both'` (ruling zdEa #1): load beyond 0.2 kpc
> and within 20 kpc, release below 0.1 kpc or beyond 40 kpc. Rows that declare one edge keep their meaning.

### Evaluation rules (core, one place)

- `'always'` → demand, never release. `'whenSearching'` → demand while the palette is open, never release (as pgcAlias does today).
- Object form:
  - `shown` = `visibilitySwitchOf` over the resolved items (any), OR'd with their label switches when `labelsCount` is set.
  - `tierOk` = `tiers` is absent or holds `ctx.tier`.
  - `scaleIn` / `scaleOut` = the `near` and `size` load/release tests. An absent gate counts as in and never out.
  - `lifted` = any `alsoWhen` holds.
  - **demand** = `shown && tierOk && (scaleIn || lifted)`.
  - **release** = `!tierOk || !shown || (!lifted && scaleOut)`.
- Every object-form row releases when switched off (rulings kw33 #4, 6a7D #1). It's one rule with no asymmetry.
  The cost is that switching a layer back on refetches it, and switching off skips the fade-out (satellites
  already works this way). This picks up the "Switching a layer off never frees its VRAM" backlog item: PR A
  deletes its index line and detail file.
- A `band` whose entry is missing, or which names no such edge, throws at row construction.

## PR A — migration, same behaviour

Every row moves to `AssetDemand`. Body-texture and mesh rows keep a transitional code variant
`{ fn: DemandFn; release?: DemandFn }` in this PR only. PR B deletes it together with the last function rows,
so after B no row carries a function.

| Row | Today | As data |
|---|---|---|
| constellations, flow, cosmicWebFilaments | `settings.<x>.enabled` | `{}` (shown from `gates`) |
| cosmicWebDensity (per cube), starCatalog survey | item switch | `{}` |
| galaxyCatalog points | switch && tier target > 0; release on excluded tier | `{ tiers }` (built from `tierTarget`) |
| structureCatalog | any bulk category ring or label on | `{ shown: { address: 'structureRing', items: BULK }, labelsCount: true }` |
| localBubble | switch && `|eye|` < 20 kpc; release > 40 kpc | `{ near: { band: 'shell', edge: 'out', lead: 2, release: 4 } }` (out[1] = 10 kpc) |
| satellites | any class && (palette ∨ selected ∨ < 900k km); release mirror | `{ shown: 'satellites', near: { band: 'nearEarth', edge: 'out', lead: 1.5, release: 2.5 }, alsoWhen: ['searching', 'selected'] }` |
| bodyTextureAtlas, hiResFamous, famousStarsMeta | `() => true` | `'always'` |
| pgcAlias | `ui.paletteOpen` | `'whenSearching'` |
| body textures, mesh rows | distance radii | transitional `fn` |

Flagged behaviour changes, each pinned by a test:

- Every object-form row releases when switched off. Today only satellites does, and localBubble stays loaded
  until 40 kpc. PR A therefore depends on the release-hook prep PR. The plan must also check `onRelease` on
  every other object-form slot (structureCatalog, the gaia stream's partial free per the "Star catalog memory
  residuals" item) before relying on it.
- `visibilitySwitchOf` applies the section rule, so structureCatalog stops demanding while the structures section
  is off. Check `hasSectionSwitch('structures')` in the plan; if it is false, nothing changes.

`SATELLITE_FADES.loadWithinKm` / `releaseBeyondKm` become the 1.5 / 2.5 factors, and the localBubble literals are
deleted. Tests pin every migrated row's load and release distances (each just inside and just outside its edge),
satellites' search and selection lifts, and the tier exclusion.

## PR B — scale gates

- **`drawPxPerRad` on `FrameOutputs`.** runFrame writes the max `drawPxPerRad` over the frame's drawing views
  (captures excluded) after `runFrame.ts:194`. `buildDemandCtx` hands it on as `ctx.drawPxPerRad`. Before the
  first frame it is 0, so nothing size-gated demands yet.
- **`size`, evaluated through `bodyApparentDiameterPx`.**
  - Body textures: `{ body, loadPx: 16, releasePx: 8 }`.
  - Mesh rows: `loadPx` = the body's `resolvePx` (3), `releasePx` 1.5. Below 3 px the glint shows. Between the
    handoff and residency a mission mesh draws nothing (`sceneBodyPartition.ts:9`); the owner accepted this
    (load at 3 px).
  - Core also requires `spacecraftPresent` for craft.
  - For a surface site (`position.kind === 'site'`), core requires the eye-to-site segment to clear the host's
    inner-bound sphere before loading (load only, never release), via `subjectOccludedByBodies`.
  - Deleted: `bodyTextureLoadRadius.ts`, `pastTextureReleaseRadius.ts`, `meshBodyLoadRadius.ts`, the transitional `fn`.
- **Band approach on the survey rows.** galaxyCatalog points, cosmicWebDensity and cosmicWebFilaments declare
  `near: { band: 'deepZoom', edge: 'in', lead: 10, release: 100 }`. Flow declares the same against its
  `FLOW_DEEP_ZOOM` band. Constellations declare `{ edge: 'out', lead: 10, release: 100 }`.
- **localBubble at Earth.** `edge: 'both'` joins `NearGate`, and localBubble declares
  `{ band: 'shell', edge: 'both', lead: 2, release: 4 }`. That leaves the bubble unloaded at Earth, loaded from 0.2 to
  20 kpc, and released below 0.1 or beyond 40 kpc.
- **Survey galaxy lifts.** `alsoWhen: ['searching', 'selected']`, with `selects: ['galaxyCatalog']` added to the
  survey entry.
  - `watchSelectionRevealSaga` only writes when the cluster has a section switch that is off. `galaxyCatalogs` has
    none, so the new `selects` reveals nothing. (Checked 2026-11-06.)
  - A selected famous galaxy pins the survey catalogs too, because the selection kind doesn't split famous from
    survey. That is accepted.
- **A band gates only the items it lists** (ruling BuBQ #2). The resolver applies `near` only when the band has no
  `items`, or when they include the row's item. The famous catalog stays exempt from `deepZoom` for fetching, as it
  already is for fading. There is no per-row exception.
- **Structure catalog** (ruling BuBQ #4): `near: { band: 'cosmic', edge: 'in', lead: 10, release: 100 }`.
- **Gaia stars get a band as the single truth** (ruling BuBQ #1).
  - The `starCatalog` show entry gains `survey: { out: [8 kpc, 25 kpc], items: ['gaiaStars'] }`. Today this is the
    registry's `crossfadePc`, applied by hand.
  - The Gaia row declares `near: { band: 'survey', edge: 'out', lead: 10, release: 100 }`: it loads within 250 kpc
    and releases beyond 2.5 Mpc.
  - The star passes read the band fade through their address. Deleted: `crossfadePc` (registry field and type),
    `starCrossfadeOpacity.ts`, and the band maths in `starSourceDrawOpacity`, `starSourcesInBand` and
    `starCatalogVisible`.
  - Also fix the overstated comment at `starCatalog/visibility.ts:28`.
- Backlog: delete "Scale-gated asset demand" (index line + detail file) in this PR.

## Risks

> [!RISK] A catalog pops in late on a fast zoom-out
> One decade of lead (0.2 kpc) hides the fetch within normal zoom speed; on a slow connection the fade can still
> finish before the data arrives. The release decade keeps a dithering camera from refetching.

> [!RISK] Render-on-demand idles the loop
> Demand only runs on rendered frames, so a pure clock advance carrying Venus near Earth waits for the 500 ms idle
> tick. That is harmless for loads that take seconds.

## Adjacent (backlogged, not in scope)

- Asset `priority` rungs are hand-picked, and no test checks that they are distinct.
- The selection kind can't tell famous galaxies from survey ones.
