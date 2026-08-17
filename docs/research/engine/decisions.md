# Engine subsystem bundles + analytic MW landing — decisions record

Brainstorming session 2026-08-16/17, branch `worktree-land-milky-way-refactor`.
Companion maps in this directory: [field-seam-map.md](field-seam-map.md) (tool↔app
seam), [engine-composition-map.md](engine-composition-map.md) (frame program, layer
lifecycle, v1 deletion inventory, accretion sites),
[subsystem-sweep.md](subsystem-sweep.md) (all 14 subsystems vs. the contract +
shared vocabulary). This file records the *decisions*; the maps carry the evidence.

## Goal

Land the v2 analytic Milky Way field in the main app, **replacing** the v1 sprite
bag (v1 deleted in the same effort; catalog fly-bys out of scope for the landing but
the architecture is written against them). Acceptance = a fresh in-app calibration
pass by the user, not tool parity. App exposes minimal knobs; the galaxy tool stays
the deep tuning surface.

## Decisions (in order made)

1. **Scope**: MW field replaces the bag; v1 sprite path deleted in this effort.
   Catalog-galaxy fly-bys not landed now, but seams shaped for them
   ([realtime vision](#fly-by-target)).
2. **Settings**: minimal app knobs (enable, exposure-ish, dust toggle); tool keeps
   the deep panel. Sprite-bag knobs (`MilkyWayTuning`) die with the bag.
3. **Acceptance**: fresh in-app calibration pass (exposure vs HDR/bloom, descent
   into Gaia stars). Tool look is the starting point, not the gate.
4. **Architecture level**: "C" — declarative subsystem bundles (Level 2) + derived
   debug (Level 3's honest half). **Explicitly rejected**: derived frame ordering
   via toposort/render-graph (frame order constraints are semantic, not dataflow —
   multiplicative dust after additive emission, NEAR0 over COSMO, tone-map last;
   ~13 stable steps; the explicit ordered step list IS the honest representation),
   and Level 4 schema-generated settings UI.
5. **Fly-by target**: the spec is written against real-time per-galaxy generation
   (user directive 2026-08-11, memory `galaxy-engine-realtime-vision`): field
   renderer instantiable per galaxy (MW = instance #1), generated artifacts
   budgeted/time-sliced/async-completable, LRU/eviction later. MW may keep an
   eager hero-tier path.
6. **Vocabulary** (from subsystem-sweep TASK B): adopt incumbents; **do not coin
   "phase"** — layers pin to `(target, slab)` and the hand-authored `frameProgram`
   step list stays the ordering artifact (a walker validates coverage). "Planner"
   is the official noun for per-frame prepare (verb standardized). Presentation
   producers remain three named mechanisms (LabelProducer / MarkerProducer(new,
   grown from LabelProducer's shape) / drawPick) — no fake-unified registry. Say
   "render target contribution", not "private target".
7. **Contract amendments from the 14-subsystem sweep**:
   - Artifact kinds: `baked | generated | fetched | streamed` (streamed =
     earthTiles-style paged; imperative upload like `addVolumeField` folds into
     `generated` explicitly). `generated` carries stalenessKey + optional budget.
   - Wake: bundle votes fold into `shouldKeepTicking`'s `anim` bag (already past
     the second-special-case trigger: starFadeAnimating, earthTilesAnimating,
     flow's bespoke clause, followApproachEaseActive).
   - Cross-subsystem ambient state (structureFocus → ctx.focus/focusBlend →
     shared focus uniform): engine-core `ctx` state; rule = bundles read ctx,
     never write it.
   - Step-level gates: `FOREGROUND_MAX_DISTANCE_MPC` moves from ~9 layers'
     `enabled()` to a gate on the frame step itself.
   - Bundle handles are shared across the bundle's own layers; the selection-halo
     slab-partition invariant becomes a named pattern.
   - `devOnly` flag on debug layers. Pick ownership may span rows (planetsLayer
     picks for textured bodies; caption-only anchors draw nothing).
   - Planner-hoist (memoised on ctx, `prepareStarCut` style) is the norm; the four
     solar-system derivations recomputed per call site migrate to it (long tail).
   - Liveness: both incumbent forms first-class (`deriveXLiveness` file where
     non-trivial; inline gates over shared derivations otherwise).
   - Fades (added 2026-08-17): bundles declare their `FADE_LAYERS` manifest rows
     (`fades?: readonly FadeLayer[]`); the wiring manifest becomes a
     concatenation over bundles. `FadeId` + `VisibilityLayerKey` unions stay
     type-level; a bundle declares which keys it services. **Invariant for
     Track C: the field bundle REUSES `{kind:'milkyWay'}` and the
     `milkyWayDisk`/`milkyWayLabel` visibility keys — minting new ones breaks
     every tour/clip that scripts hide/show intents against them.** Store stays
     fade-free (standing decision). Horizon shell's missing fade handle becomes
     a one-row fix or a documented choice at its migration.
8. **Engine-core keeps** (never bundle-owned): shared accumulators (`hdr`, `swap`,
   `foreground:0`, bloom mips), step-level gates, ctx ambient state, pickProgram
   infrastructure, tone/bloom post, camera/input.
9. **Ladder sequencing** (2026-08-17, supersedes Track A's one-PR packaging):
   composition surfaces are normalized **one family at a time** — evidence and
   per-family shapes in [current-contracts-map.md](current-contracts-map.md) —
   each rung a behaviour-neutral PR of its own. The umbrella `SubsystemBundle`
   type is **deferred** until the rungs land, then reassessed: by that point it
   is a thin grouping over rows that already exist, or possibly unnecessary.
   Anti-drift discipline: every family's rows are keyed by the same subsystem
   `key: string` from rung 1, and the contract sketch below stays the north
   star each rung is checked against. The Track A spec becomes
   reference-not-executable (target shape, not an execution plan).
   Rungs, in order: **1** handle registry (`key`, `construct`,
   `rebuildOnSwapFormat?`; teardown + swap-rebuild derived), **2** target
   contributions (`clearValue` onto the spec row, `scale` as
   `number | (state)=>number`, blend/format-parity validation; deletes the
   `mwAggregateDivisor` param + `runFrame` rebuild branch), **3**
   generated-artifact staleness helper (`stalenessKey` + `regenerate`; migrate
   the ~8 hand sites starting with MW `starCount`), **4** volume-ingest
   consolidation (3 copies → 1 fn; imperative side-door's fate decided here),
   **5** wake-vote fold, **6** debug derivation, **7** the
   `FADE_ROW`/`VISIBILITY_ACTION_ROW` derivation decision. Rungs 1 and 3 get
   mini-plans; the rest are bounded changes. Track B is unchanged and
   parallel; **Track C gates on B + rungs 1–3 only**, so the MW landing gets
   earlier, not later.
10. **Row-divergence rule** (2026-08-17, user directive): when a subsystem's
    row doesn't fit a family's row shape, never encode the misfit as a per-row
    exception — no optional field only one row reads, no flag, no bolted
    branch. Re-evaluate **both ends**: the row shape AND the underlying
    contract (loading / rendering / data structure) that produced the misfit.
    Either the underlying contract gets refactored so the row fits, or the row
    shape was wrong and changes for **all** rows. An optional field is
    legitimate only when it names a capability several rows share (e.g.
    `rebuildOnSwapFormat`), never one subsystem's quirk. This applies at every
    rung and at the final umbrella reassessment.
11. **Rung widenings from the renderer/layer sweep** (2026-08-17): the
    exhaustive sweep ([renderer-layer-outliers.md](renderer-layer-outliers.md))
    assigns every outlier to a rung — rung 2 grows the aggregate→upsample
    shared primitive (copy-paste ×3 confirmed), rung 4 widens from
    volumes-only to multi-item ingest normalization (`upload`/`unload` verbs),
    rung 7 widens to full fade-path canonicalization (3 canonical consumers,
    5 dead handles), and a new **rung 8** (label-mechanism unification —
    foregroundLabels' private director) sequences after Track C. Hygiene
    basket (grow-buffer ×7, fade-scratch ×4, fullscreen-tri ×5, hypot ×10) is
    PR-anytime. Bug-suspects to verify early: compositor not swap-rebuilt;
    fieldStarSphere missing the FOREGROUND_MAX gate.

## The contract (settled sketch)

```ts
type SubsystemBundle = {
  key: string
  settings?: SettingsContribution              // settings.<layer>, singleton or .items[id]
  targets: readonly RenderTargetContribution[] // RenderTargetSpec + scale: n | (s) => n
  artifacts: readonly ArtifactDecl[]           // baked | generated | fetched | streamed
  handles: (device, targets) => Record<string, Disposable>
  layers: readonly ContentLayer[]              // + devOnly?; validated against frameProgram steps
  computes?: readonly ComputeContribution[]    // rows in the COMPUTE record
  planner?: (state, ctx) => unknown            // hoisted, memoised on ctx
  liveness?: DeriveLiveness | InlineGates
  wake?: (state, ctx) => boolean               // folded into the anim bag
  fades?: readonly FadeLayer[]                 // FADE_LAYERS manifest derived by concatenation
  labelProducers?: readonly LabelProducer[]
  markerProducers?: readonly MarkerProducer[]
  debug?: { groupTitle: string; sliders?: readonly SliderField[] }
}
```

## Ground preparation (verdicts in engine-composition-map §4 + sweep misfits)

- **P1** Bundle contract + engine-core walkers (targets/handles/staleness/frame
  assembly/derived debug incl. PASS_GROUP_TITLES + TIMED_SLOTS) + adapter wrapping
  the legacy hand-wired style. Behaviour-neutral.
- **P2** Migrate provers: volumes, star catalog, MW v1-as-is, plus filaments and
  constellations (confirmed clean fits). Deletes `mwAggregateDivisor` param, both
  `runFrame.ts:211-281` mismatch branches, hand-maintained debug maps.
- **P3** Extract field/ISM orchestration from `tools/galaxy-renderer/src/engine/`
  into `src/services/gpu/renderers/galaxyField/` (instantiable per galaxy); tool
  consumes it. Tool-neutral (probe gates it).
- **P4** `MilkyWaySettings` identity/tuning split.

Feature: **F1** MW field bundle alongside v1 → **F2** user calibration pass →
**F3** delete v1 (inventory: engine-composition-map §3; promote
`MILKY_WAY_RADIUS_MPC`, `MILKY_WAY_MODEL_SCALE`, fade thresholds — v1/README
"promote, not delete"). Long tail: remaining subsystem migrations, adapter
deletion — follow-up PRs, each mechanical.

## Execution tracks (session-splittable)

- **Ladder (supersedes Track A — decision #9)**: seven per-family rungs, each
  its own behaviour-neutral PR in a fresh worktree. Rungs 1 & 3 get mini-plans
  (SDD execution); rungs 2, 4–7 are bounded changes. P4 (MilkyWaySettings
  split) is folded into Track C prep rather than a rung of its own.
- **Track B** = P3 — own spec + plan ("galaxy field renderer extraction").
  Independent of the ladder; parallelizable in its own worktree/session.
- **Track C** = F1–F3 — executes after Track B + rungs 1–3 merge (not all
  seven).

## Spun off to backlog (not this effort)

- Focusability/selectability consolidation: every focusable kind hand-adds rows to
  ~10 files (FocusableTarget, SelectionRow, selectionHaloTable, pick tables, URL
  hash…) — a surface as large as rendering; bundle contract deliberately excludes.
- Tool bloom-mirror deletion (`encodeBloomPyramid` consuming app `runBloom`) —
  natural near P3 but scope-creep risk.
- HII 3-target consolidation — calibration question, revisit in F2.
- Point-source double registration (GALAXY_CATALOG_SOURCE_REGISTRY + ASSET_WIRING
  stub row).
- Horizon shell has no settings + no FadeRegistry handle (unhideable by intent
  surface).

## Open items

- PR packaging: one-PR-per-track (confirmed earlier on 2026-08-17) is
  **superseded by decision #9** — one PR per ladder rung; Track B keeps its own
  single PR; Track C after B + rungs 1–3.
- Tier story: `MILKY_WAY_STARS_PER_TIER` + watchTierSaga bridge deleted with v1,
  no replacement (field cost is tier-independent). Decided, listed here for
  visibility.
- JWST dust view + diagnostic overlays stay tool-only. HII ships as 3 targets
  initially.
