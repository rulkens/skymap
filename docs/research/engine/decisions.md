# Engine subsystem bundles + analytic MW landing — decisions record

Brainstorming session 2026-08-16/17, branch `worktree-land-milky-way-refactor`.
Companion maps in this directory: [field-seam-map.md](field-seam-map.md) (tool↔app
seam), [engine-composition-map.md](engine-composition-map.md) (frame program, layer
lifecycle, v1 deletion inventory, accretion sites),
[subsystem-sweep.md](subsystem-sweep.md) (all 14 subsystems vs. the contract +
shared vocabulary). This file records the _decisions_; the maps carry the evidence.

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
   Anti-drift discipline: ~~every family's rows are keyed by the same subsystem
   `key: string` from rung 1~~ **REFINED by #12 (2026-08-18)** — rows are
   identified in their own domain; only the contract sketch below stays the
   north star each rung is checked against. The Track A spec becomes
   reference-not-executable (target shape, not an execution plan).
   Rungs, in order: **1** handle registry (`key`, `construct`,
   `rebuildOnSwapFormat?`; teardown + swap-rebuild derived), **2** target
   contributions (`clearValue` onto the spec row, `scale` as
   `number | (state)=>number`, blend/format-parity validation; deletes the
   `mwAggregateDivisor` param + `runFrame` rebuild branch), **3**
   ~~generated-artifact staleness helper (`stalenessKey` + `regenerate`; migrate
   the ~8 hand sites starting with MW `starCount`)~~ **REFINED by #13
   (2026-08-19)** — the premise is refined, not dropped: 7 true sites surveyed,
   6 already resource-owned, **1 relocated into its own resource**
   (`MilkyWayCloud.reconcile`), and **no helper exists** — the registry question
   re-opens at rung 4 only under #13's condition; **4** volume-ingest
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
    shared primitive (copy-paste ×4 confirmed, post-merge: zone-of-avoidance's
    `zoneOfAvoidanceUpsampleLayer`, #555, is a 4th verbatim instance, and its
    bolted-on caption draw means the shared primitive needs an optional
    post-blit hook to fit it without a per-row exception), rung 4 widens from
    volumes-only to multi-item ingest normalization (`upload`/`unload` verbs),
    rung 7 widens to full fade-path canonicalization (4 canonical consumers
    post-merge — zone-of-avoidance's fade row is fully wired through
    `resolveLayerOpacity`, not a raw copy — 5 dead handles, unchanged), and a
    new **rung 8** (label-mechanism unification — foregroundLabels' private
    director, now joined by zone-of-avoidance's private MSDF glyph pipeline as
    a 3rd private label path, #555) sequences after Track C. Hygiene
    basket (grow-buffer ×7, fade-scratch ×4, fullscreen-tri ×5, hypot ×10) is
    PR-anytime. Bug-suspects to verify early: ~~compositor not swap-rebuilt~~
    RESOLVED NEGATIVE — `compositor.ts:178-190` documents `swapFormat`/
    `hdrFormat` as unused, pipelines cache on the live per-frame `dstFormat`,
    so there is no baked format to go stale; confirmed also by a clean
    HDR-toggle visual smoke; fieldStarSphere missing the FOREGROUND_MAX gate.
12. **How family rows are keyed** (2026-08-18, ruled in rung 2 — refines #9's
    anti-drift sentence): a row is identified **in its own domain** — the handle
    row by its `EngineGpuHandles` field name, the target row by its
    `RenderTargetSpec.id`, the upsample layer row by its `ContentLayer.name`.
    Subsystem attribution is carried by the contributing **bundle**, never
    duplicated onto each row. #9's literal reading doesn't survive the code:
    rung 1's `key` is an `EngineGpuHandles` field name, not a subsystem (one
    subsystem owns several rows — `milkyWay` owns four), and 6 of the 12 target
    rows are engine-core per #8, so a subsystem `key` would have to be
    fabricated for them. Binding for rungs 3–7: **do not add a `key: string` to
    a family row whose identity already exists in its own domain.** At the
    umbrella reassessment rows get **grouped** under a bundle key, never
    re-keyed. Evidence + the rejected alternatives:
    [rung-2 plan](../../superpowers/plans/2026-08-18-target-contributions.md).
13. **The staleness family is resource-owned** (2026-08-19, ruled in rung 3 —
    refines #9's rung-3 clause): a fresh survey of the idiom "compare a live
    setting against a fact recorded on an already-constructed resource, then
    regenerate" found **7** sites, not ~8 — the missing one was the
    render-target divisor rebuild, which rung 2 already folded into
    `RenderTargets.reconcile`. A site could have joined a shared mechanism only
    if all five clauses held: (1) the want is a pure function of `EngineState`;
    (2) the fact is recorded **on** the resource by `regenerate` itself, no
    shadow copy; (3) `regenerate` is synchronous and self-recording, so the next
    compare settles; (4) the compare is the sole trigger — no fused disjunction,
    no supplementary gate, no second writer; (5) the cadence is per-frame and
    unconditional. Exactly one site passes, and that is the **result**, not an
    admission gate for the future: sites 2, 5 and 6 fail only the clauses that
    describe _where the compare is called from_, and they fail them because
    their compare already lives inside the resource; site 3 is the same, one
    family over. Conclusion: **the staleness idiom in this codebase is
    resource-owned, and site 1 was a compare inlined in the wrong module.**
    `RenderTargets.reconcile` (`renderTargets.ts:326-338`) is that same answer,
    written down first. Per-site rulings:
    - **1** MW `starCount` → cloud regenerate (was `runFrame.ts:209-243`) —
      **moved** into `MilkyWayCloud.reconcile`; `runFrame` makes one declarative
      call, and no caller-side copy of the count can exist any more.
    - **2** volume-field palette → LUT re-upload
      (`volumeFieldRenderer.ts:409-412`) — **stays**: already resource-owned,
      and per-item over a dynamic collection rather than a singleton handle.
    - **3** pick-slab targets vs viewport (`pickProgram.ts:126-155`) — **the
      target family inherits it**, via `RenderTargets`' deferred pick rows
      (`renderTargets.ts:170-175`); routing it elsewhere would fork the
      render-target family across two owners.
    - **4** stale committed tier on a texture slot
      (`reevaluateDemand.ts:97-106`) — **rung 4 inherits it**: its action is one
      arm of a two-reason `release()` over an else-if chain that exactly
      partitions the slot states, so per #10 the fix is at the ingest contract.
    - **5** earth planner params vs live tier (`earthTileSubsystem.ts:140-153`)
      — **stays**: hoisting the compare out of its accessor would arm the
      manifest fetch on frames where the earth layer is off.
    - **6** earth page table vs uploaded window
      (`earthTileSubsystem.ts:299-308`) — **stays**; **rung 5 inherits its wake
      half** (the same staleness fact _is_ `isAnimating()`). Its compare is
      fused with `rebuildOwed()`, and `uploaded === null` is load-bearing in
      both directions.
    - **7** swap format vs the swap row (`applySwapFormat.ts:21-23`) — **stays,
      and is finished**: an event-armed debouncer over an already-declarative
      rebuild set (`GPU_HANDLE_ROWS.rebuildOnSwapFormat`) is not debt.

    **No registry, no walker, no row type was built.** A
    `GENERATED_ARTIFACT_ROWS` table plus a per-frame sweep was considered and
    rejected: it ships with one row whose resource dies at Track C's F3, its
    closure-shaped rows erase `stalenessKey` _as data_ — the one thing a future
    budget walker must read — and #5's fly-by artifacts, the future rows it was
    being built for, fail clauses 3 and 5 of the test above.

    **Re-open condition, checkable at rung 4**: a generated-artifact row table
    is reconsidered **iff** folding `addVolumeField`'s imperative upload into
    the `generated` kind — which #7 already mandates by name — yields **two or
    more** artifacts that genuinely share the shape once the ingest contract is
    normalized. Rung 4 arrives carrying both this condition and site 4. If it
    holds, rows are **plain data** — `stalenessKey` / `resident` / `regenerate`
    readable at the table, **never closures**. If it does not, the family is
    resource-owned and stays that way. #7's "`generated` carries stalenessKey +
    optional budget" is deferred to that same reassessment.

    **The flow-field latch stays; it is not unified.** `flowFieldRenderer` +
    `createReseedLatch` + `watchFlowReseedSaga` solve the same user-visible
    problem (count/mode change → reseed) recording no fact on the resource, and
    are deliberately kept: the reseed is a compute pass that does not run while
    flow is disabled, so the new fact cannot be recorded at compare time (clause
    3); and a latch fires **once per arm** where a compare **self-heals from any
    divergence source** — load-bearing for MW (a tier re-seed of
    `settings.milkyWay.starCount` is picked up with no second writer) and
    deliberately absent for flow, whose saga re-arms on an unchanged value. Two
    idioms, two shapes, one recorded reason.

    **`stalenessKey` is a primitive** — a refinement of the looser typing a
    reader could infer from the contract sketch's `(state, ctx) => unknown`.
    Every recorded fact across the seven sites is a primitive or a small record
    compared field-by-field, and the compare is `!==`. A key typed `unknown`
    needs a comparator, which is the first step toward the fused predicates #10
    bans. Evidence + the rejected registry:
    [rung-3 plan](../../superpowers/plans/2026-08-19-generated-staleness.md).

## The contract (settled sketch)

```ts
type SubsystemBundle = {
  key: string;
  settings?: SettingsContribution; // settings.<layer>, singleton or .items[id]
  targets: readonly RenderTargetContribution[]; // RenderTargetSpec + scale: n | (s) => n
  artifacts: readonly ArtifactDecl[]; // baked | generated | fetched | streamed
  handles: (device, targets) => Record<string, Disposable>;
  layers: readonly ContentLayer[]; // + devOnly?; validated against frameProgram steps
  computes?: readonly ComputeContribution[]; // rows in the COMPUTE record
  planner?: (state, ctx) => unknown; // hoisted, memoised on ctx
  liveness?: DeriveLiveness | InlineGates;
  wake?: (state, ctx) => boolean; // folded into the anim bag
  fades?: readonly FadeLayer[]; // FADE_LAYERS manifest derived by concatenation
  labelProducers?: readonly LabelProducer[];
  markerProducers?: readonly MarkerProducer[];
  debug?: { groupTitle: string; sliders?: readonly SliderField[] };
};
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
  Detail file: [focusable-kind backlog](../../backlog/2026-08-17-focusable-kind-registry.md).
  A second, related backlog item landed with the merge:
  [focusability is declared twice on the same discriminant](../../backlog/2026-08-17-focusability-double-encoded.md)
  (`ROW_FOCUSABLE` vs `focusFraming`'s throw, both hand-encoding "does this row
  carry a position?"). Zone-of-avoidance (#555) is fresh, first-party evidence
  for the surface's cost: adding ONE new kind — including declaring it
  NON-focusable — required 13 hand-touched production files (`SelectionRow.d.ts`,
  `FocusableTarget.d.ts`, `SelectionRef.d.ts`, `focusFraming.ts`,
  `buildFocusable.ts`, `extractSelectionRow.ts`, `refOf.ts`,
  `resolvePickTable.ts`, `rowFocusable.ts`, `selectionHaloTable.ts`,
  `targetIdentityKey.ts`, `focusIdOf.ts`, `urlHashFor.ts` — commit `e1f3eeace`),
  the same "selection type-arm cascade" the backlog item names.
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
