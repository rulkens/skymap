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
   - Step-level gates: ~~`FOREGROUND_MAX_DISTANCE_MPC` moves from ~9 layers'
     `enabled()` to a gate on the frame step itself.~~ **REFINED by #16
     (2026-08-20)** — not rung 6's; re-pointed at the frame-step work alone
     (`renderer-layer-outliers.md:204`). **10** layers gate on it, not ~9,
     spanning **three** frame steps (`foreground:0·NEAR0`, `hdr·NEAR0`,
     `swap·NEAR0`), so one step-level gate cannot host it as written — four
     would over-gate every other layer sharing those steps.
   - Bundle handles are shared across the bundle's own layers; the selection-halo
     slab-partition invariant becomes a named pattern.
   - ~~`devOnly` flag on debug layers.~~ **REFINED by #16 (2026-08-20)** —
     rejected: no `devOnly` field exists and no reader would exist for one
     (`grep -rn devOnly src/` finds one comment, `DebugOverlayRow.d.ts:4`,
     naming the rejection — no field); dev-only-ness lives in
     `DEBUG_OVERLAY_ROWS` membership instead (D3). Pick ownership may span
     rows (planetsLayer picks for textured bodies; caption-only anchors draw
     nothing).
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
   5 already resource-owned, **1 relocated into its own resource**
   (`MilkyWayCloud.reconcile`), 1 deferred to rung 4, and **no helper exists** —
   the registry question re-opens at rung 4 only under #13's condition;
   **4** ~~volume-ingest consolidation (3 copies → 1 fn; imperative side-door's
   fate decided here)~~ **REFINED by #14 (2026-08-19)** — **five** copies, not
   three, folded into one `uploadVolumeField`; the imperative side-door is
   **kept and folded**, not deleted; #13's re-open condition is checked and
   **fails**, so there is no table to expect; site 4 closes with a ruling, not a
   patch; **5** ~~wake-vote fold~~ **REFINED by #15 (2026-08-20)** — one
   `anim` bag field (`labelsAnimating`) plus two deletions, no table; a
   reader of #9 alone should not expect a wake registry, see #15; **6** ~~debug
   derivation~~ **REFINED by #16 (2026-08-20)** — a settings-mechanism
   consolidation (one `DEBUG_OVERLAY_ROWS` record, one `SliderField<K>`, one
   generic `DebugTuningSection`); no walker, no layer registry, no `devOnly`
   field — see #16; **7** the
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
    HDR-toggle visual smoke; ~~fieldStarSphere missing the FOREGROUND_MAX
    gate~~ **RESOLVED NEGATIVE** (2026-08-20) — self-gated on camera POSITION
    at ~1.45 AU (7.04e-12 Mpc), ~10.5 orders of magnitude tighter than the
    0.23 Mpc cut; `enabled()` measured
    `false` at cosmic zoom; the only divergent pose is unreachable, and current
    behaviour would be correct there anyway (#16 D6). Residual cited, not
    fixed, at `docs/backlog/2026-07-30-camera-target-vs-origin-distance-gates.md`.
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

14. **Volume ingest is one function, and the imperative door folds into it**
    (2026-08-19, ruled in rung 4 — refines #9's rung-4 clause): the docs said
    "ingest ×3"; the exhaustive survey found **five** hand-written copies of the
    same commit body — `cf4DensitySlot`, `mcpmSlot`, `polyphorm2MrsSlot`, the
    shared closure that mints all three DEV fixtures (`syntheticVolumeSlots`),
    and the public `handle.volumes.add`. They differed along four dimensions and
    **all four are accidental**: each has a majority form that is also the
    correct form, so `uploadVolumeField(state, store, id, cube)` takes them
    as-is — **no options bag, no flag, no per-caller policy argument**. A
    reviewer expecting a parameterized helper should read the four rulings:
    - **1** settings seed — the store dispatch is an identity no-op when the row
      already exists, so it is correct for all five callers. The fixtures'
      inline copy-on-write was the odd one out **and was broken**: it assigned
      into Immer-frozen slice state, a `TypeError` had it ever been reachable.
      Deleted, not ported.
    - **2** wake — the door's explicit `requestRender()` is redundant, and its
      "essential wake" comment was **false**: `watchWakeSaga.ts:47-55` wakes on
      _every_ settings-route action, and `settings/addVolumeField` is one. The
      line stays, relabelled redundant-but-local, so the ingest path's wake does
      not depend on saga wiring order; **rung 5 owns deleting it**, together with
      the path's other wake owners (`watchWakeSaga`, `installSlotReadyWake`).
    - **3** id source — not a difference at all: it is the function's `id`
      argument, each caller holding its own id in its own domain (#12).
    - **4** null renderer — four of five copies returned early; the door alone
      faded and woke with nothing uploaded, contradicting its own docblock.
      Majority form wins: the guard wraps the whole body, re-read per call.

    The pair is deliberately **not** symmetric about the null renderer:
    `unloadVolumeField` still removes the settings row, because the row's
    lifetime is independent of the GPU resource's. Essential ⇒ kept, one line in
    the header, not a section.

    **The fold stops at the volume family.** `flowFieldSlot` uploads a _velocity_
    cube into a _different, singleton_ renderer (`upload(cube)` — no id) and
    gates a _different_ fade key behind a _different_ guard; `filamentSlot`,
    `constellationsSlot` and `starCatalogSlot` (which drives no fade at all) are
    the same story one family over. A generic
    `commitUpload(state, pickRenderer, upload, fadeKey)` spanning all eight slot
    commits was considered and **rejected**: it parameterizes away exactly what
    the volume function asserts, and #6 already named the failure mode — no
    fake-unified registry. Four counter-examples, one recorded reason, written in
    the shared function's header where the apparent inconsistency is visible.

    **The imperative door is KEPT and folded, not deleted** (D3).
    `handle.volumes.add`/`.remove` have zero callers in `src/`, `tests/` and
    `tools/`. Deleting them was considered and rejected on three grounds. (1)
    Track A's 2026-08-17 investigation already ruled the handle the legitimate
    entry point for runtime-supplied cubes the demand system cannot express (no
    URL, not in the registry), and prescribed exactly this consolidation; rung
    4's evidence confirms it rather than overturning it. (2) The 🔴 the contracts
    map flagged was the _duplicated bookkeeping_, and the fold deletes it — the
    door is no longer a parallel lifecycle, and rung 3's D2 "generality with no
    instance" objection dissolves at five callers. (3) `unloadVolumeField` is the
    **only** caller of `volumeFieldRenderer.unload` anywhere in `src/`; deleting
    the door would make `volumeFieldRenderer` a **third dead release surface**
    beside `catalogStore.unload` (test-only callers) and `filamentRenderer.clear`
    (none outside its own module) — i.e. it would mint the very outlier
    (upload-without-unload, `starCatalogRenderer`) that #11 asks this rung to
    normalize away from. The door stays a three-line delegation, its public
    method names unchanged, with the escape-hatch ruling recorded on
    `EngineVolumesHandle.d.ts`.

    **#13's re-open condition is checked, and it FAILS — no row table, no row
    type, no walker** (D4). The condition asked for **≥2** artifacts genuinely
    sharing the shape once ingest is normalized. The count, spelled out: the
    **three** registry volumes are `fetched` — fetcher, `AssetSlot`, `req(tier)`,
    `LoadState` and demand predicate, already three `ASSET_WIRING` rows
    (`assetWiring.ts:239-269`); riding a shared ingest function does not
    reclassify them. The **three** DEV fixtures do read as `generated` — their
    fetcher generates the cube (`syntheticVolumeFetcher.ts:1-8`) and they have no
    `ASSET_WIRING` row — but carry **no `stalenessKey`**: their request is a
    hard-coded literal at the single call site (`maybeLazyLoadDebugVolume.ts:31`)
    projected from no live setting, the load is one-shot behind an idle guard,
    and the whole path is `import.meta.env.DEV`-gated, so a table built for them
    ships **zero rows** in production. The door's cube is **externally
    supplied**, with neither a `stalenessKey` (it is a projection of no setting)
    nor a `regenerate` (the engine cannot re-derive a cube it was handed). So the
    keyed `generated` family still has exactly **one** member — the Milky-Way
    cloud, whose compare rung 3 moved into `MilkyWayCloud.reconcile`. One is not
    two; the family stays resource-owned.

    **#7's "imperative upload folds into `generated` explicitly" is refined, not
    executed as written**: the fold lands at the **ingest contract** — one
    function, five callers — not in the kind taxonomy. Classifying a
    runtime-supplied cube as `generated` would put a member with neither
    `stalenessKey` nor `regenerate` into a family defined by both, which is #10's
    banned per-row exception wearing a taxonomy hat. So the door is named for
    what it is: **an ingest-contract entry point, not an artifact kind** — which
    closes the gap `subsystem-sweep.md` opened by calling it "a whole artifact
    class the 3-way taxonomy doesn't name". Kinds classify how an artifact's
    _bytes are produced and kept fresh_; the door produces nothing and keeps
    nothing fresh, and from the renderer's side its field is indistinguishable
    from a fetched one. `baked | generated | fetched | streamed` stays a four-way
    union. **#7's "`generated` carries stalenessKey + optional budget" is
    re-deferred to the umbrella reassessment, not to another rung** — with no
    table, the clause has no home in the rungs; `budget` still has no instance
    anywhere in the repo and gets its first only at the fly-by target (#5), whose
    per-galaxy artifacts already fail #13's clauses 3 and 5. **The condition is
    closed for rungs 4–7**, and can re-open only when a second genuine keyed
    `generated` artifact exists.

    **Site 4's compare CLOSES here; its residue is re-handed** (D5). No code
    change: `staleTierEvict` (`reevaluateDemand.ts:97-106`) is already split
    correctly — the **fact** is resource-owned (`slot.lastRequest()`, whose
    docblock at `AssetSlot.d.ts:25-37` says it exists for precisely this edge)
    and only the **policy** lives in the loop, because only the loop holds
    `slot`, `row` and `state.tier` at once. The ingest normalization gives it
    nothing to move into: the ingest function is a commit-side effect and never
    sees a `req`. Both alternatives are worse — universalizing it (drop the
    `isBodyTextureKey` gate) is not behaviour-neutral and would fire `release()`
    in parallel with `makeRunTierTransition`'s in-place `slot.load({tier})` on
    `mcpm`/`polyphorm2Mrs`; putting `stale?(committed, req)` on the row is the
    single-family optional field #10 bans. The gate is therefore not the misfit
    it looks like: it is a proxy for "this family has no tier-transition driver",
    and that difference is essential. **Re-handed, explicitly not closed here**:
    how a family responds to a tier change is expressed **twice**, as two
    hand-coded membership tests (`makeRunTierTransition.ts:56-88` and
    `reevaluateDemand.ts:102`), neither derivable from `ASSET_WIRING`. That knot
    belongs to whichever family owns tier response, which is the **umbrella
    reassessment**'s question, not a rung's.

    **#11's widening boundary is the caller side, not the renderer side** (D6).
    The renderer verbs already agree — `upload(id, x)` / `unload(id)` is family
    D's norm, honoured by both `volumeFieldRenderer` and `catalogStore`. The
    divergence #11 points at is on the caller side, and that is what this rung
    normalized: five hand-written commit bodies became one function whose name
    carries the verb. Explicitly untouched, each with a reason:
    `starCatalogRenderer` has no `unload` because it has no evict path — minting
    one is dead code, the same test that sank rung 3's registry;
    `texturedBodyRenderer`'s `setMap`/`clearMap` is family C,
    single-item-per-body with the id repeated at draw time, so renaming it is a
    different family's refactor; `atmosphereShell` bakes its item set at
    construction. They stay in the outliers doc and in #11's PR-anytime hygiene
    basket.

    **No `onRelease` is wired; the coupling is recorded where it will be needed**
    (D7). Volume rows are load-once — `assetWiring.ts` declares no `release`
    predicate, and `reevaluateDemand` only calls `slot.release()` on a ready slot
    that has one — so a handler added now could never fire: untestable dead
    wiring, and speculative eviction is not this rung's business. The landmine
    runs the other way: adding a `release` predicate later **without** wiring
    `onRelease` leaks the field's four GPU resources
    (`volumeFieldRenderer.ts:340-344`). The mitigation is one comment line at the
    volume rows in `assetWiring.ts`, where a reader adding the predicate is
    already looking, plus this rung's tests over the release half, which land
    before it has a caller. Evidence + the rejected generic:
    [rung-4 plan](../../superpowers/plans/2026-08-19-volume-ingest.md).

15. **The wake-vote fold is one bag field, two deletions, and seven rulings —
    no registry** (2026-08-20, ruled in rung 5 — refines #9's rung-5 clause):
    #7 named a fold "into the anim bag" and #14 D2 handed rung 5 a deletion.
    Both were right, and both were small. A census of every genuine
    `requestRender()` call site in `src/` (dependency-wiring sites that only
    thread a `requestRender` closure through a factory are plumbing, not
    invocations, and are excluded) found **28**, none uncounted:

    | class              | count | outcome                                            |
    | ------------------- | ----- | --------------------------------------------------- |
    | MECHANISM           | 3     | untouched — `watchWakeSaga.ts:54`, `watchSelectionWakeSaga.ts:26`, `runFrame.ts:716` |
    | ESSENTIAL            | 15    | untouched                                          |
    | REDUNDANT-COVERED    | 5     | 2 deleted (volume pair, D7), 3 kept (D8)           |
    | VOTE/PREDICATE       | 2     | 1 folded (label director, D5), 1 handed to rung 8 (D6) |
    | MIXED / uncertain    | 3     | all kept; 1 reclassified ESSENTIAL (D8, D9)        |
    | **total**            | **28**| **1 folded · 2 deleted · 7 kept · 18 untouched**   |

    The five class counts sum to 28, and the outcome split (1 folded, 2
    deleted, 7 kept, 18 untouched) sums to 28 too; check both before trusting
    either. (The source survey labelled ESSENTIAL "14"
    while listing fifteen sites — corrected here; #15, not the survey, is what
    rungs 6–8 read as ground truth.) The recurring smell: a "ramp needs another
    frame" wake fired from three independent places — one already folded into
    the bag before this rung (`runFrame.ts:650-653`, the star-cut LOD fade),
    one this rung folds (the label director), one this rung hands to rung 8
    (`foregroundLabelsLayer.ts:810`'s caption ramp).

    - **D1 — the fold is one `anim` bag field plus two deletions; no table.**
      After the census the fold has exactly one genuine contributor (the label
      director) and the deletion exactly two lines. Rung 3's precedent applies
      unchanged (`decisions.md:198`, "No registry, no walker, no row type was
      built") — the bag **is** the seam, and extending it is growth.
    - **D2 — a "vote" is an `anim` bag entry, and that is the rung's
      boundary.** `shouldKeepTicking.ts:19-30` draws the line itself: every
      term but `anim` is read off `(state, s, nowMs)`; `anim` is an explicit
      bag of in-frame votes computed as a side effect of per-frame work
      already running, with no resting-state home to read from instead. The
      other seven `shouldKeepTicking` disjuncts (`selectCameraActive`,
      `texturedDisks.hasInFlightWork`, `fades.isAnyAnimating`,
      `structureFocus.isAwake`, the flow clause, `selectIsManualPlaying`,
      `followApproachEaseActive`) fail that test — they are selector or
      resource reads, already correct, and out of scope. Scope is the bag's
      contributors, not the disjunction.
    - **D3 — of the three wake owners #14 D2 named, two stay.**
      `watchWakeSaga.ts:24-49` is a route table whose per-action alternative
      is deliberate (`:41-46` — route-level wake would net
      `updateSelectionHover`, which must stay wake-free);
      `installSlotReadyWake.ts:26-35` is already one subscription over every
      slot (`allSlots`), i.e. this rung's own "N scattered calls → 1
      subscription" fold, done in advance (its header says so at `:8-11`).
      Neither is a scattered call; both stay. The deletion is the third owner
      alone.
    - **D4 — no `WAKE_LAYERS` manifest; the accretion cost is ACCEPTED.**
      `current-contracts-map.md:193,211` flag "wake terms accrete by hand
      (each = a signature edit)" as a loose spot. Ruled: the signature edit is
      the feature — a vote is reachable only while the planner computing it is
      already running, so a **required** bag field is the compile-time gate
      against a dropped vote. A manifest of rows would have to carry closures
      over per-frame planner output, which #14 D4's standing form forbids
      (plain data, never closures). Three fields, three producers, no shared
      row shape — #13's clauses fail exactly as they did for staleness. The
      "hand-maintained disjunction" observation is re-deferred to the
      **umbrella reassessment**, not to another rung.
    - **D5 — the label director's vote folds into the bag; the rung's one
      structural change.** `labelDirectorSubsystem.runFrame` used to call
      `state.subsystems.scheduler.requestRender()` from inside per-frame
      producer polling — the exact pattern `runFrame.ts:650-653` already
      documents as eliminated elsewhere. It folds cleanly because the ordering
      permits it: the director runs at `runFrame.ts:640`, the frame body's
      only early return sits at `:475` (well above it), and the
      `shouldKeepTicking` call sits at `:709-713` — so the vote is always
      computed before the decision point, in the same frame, with nothing
      between them that can return. No frame can be skipped. `runFrame` is the
      director's single caller (grep-confirmed), so the signature change
      (`runFrame(state, ctx): boolean`) has one call site. Landed: the
      director carries no `state.subsystems.scheduler` reference anywhere in
      the file; its `### Awake aggregation` header (`labelDirectorSubsystem.ts:19-23`)
      now describes the vote instead of the call; `shouldKeepTicking`'s `anim`
      parameter carries the required `labelsAnimating` field
      (`shouldKeepTicking.ts:121`) alongside `starFadeAnimating` and
      `earthTilesAnimating`, and the disjunction is ten terms, not nine
      (`shouldKeepTicking.ts:123-134`).
    - **D6 — `foregroundLabelsLayer.ts:810`'s caption wake is rung 8's, and
      the split is clean.** Four reasons: (1) no return channel exists — the
      label director is invoked directly and can return a vote,
      `foregroundLabelsLayer.draw` is invoked deep inside `executeFrame`'s
      program walk, and folding it needs a new mechanism for exactly one row,
      which #10 and #13/#14's method both forbid; (2) a remembered flag is a
      behaviour risk in a behaviour-neutral PR — any frame where the row's
      `enabled()` gate is false leaves the last frame's ramp flag stale in
      either direction, a failure mode today's in-pass call does not have; (3)
      it deepens the exact outlier rung 8 exists to fix
      (`renderer-layer-outliers.md:59` already flags `draw` writing module
      state its own `enabled` reads back); (4) rung 8 dissolves the site
      rather than folding it — once `foregroundLabelsLayer`'s captions are
      `LabelProducer`s, their ramp rides the vote this rung minted, so
      building a parallel channel now is work rung 8 would delete. Rung 8's
      author inherits this finding rather than re-deriving it.
    - **D7 — the two volume-ingest wakes are deleted, discharging #14 D2.**
      #14 kept them "so the ingest path's wake does not depend on saga wiring
      order" and handed the deletion here. The hedge is answered: each
      function dispatches its **own covering** settings action —
      `uploadVolumeField.ts:25` dispatches `settings/addVolumeField`,
      `unloadVolumeField.ts:24` dispatches `settings/removeVolumeField`, both
      `settingsRoute` members `watchWakeSaga.ts:47-49` wakes on
      unconditionally. Coverage is internal to the function, so no caller and
      no wiring order can break it — if `watchWakeSaga` were ever unwired the
      symptom would be the entire settings surface going dark, not a silent
      volume-only miss. The upload path is covered three times over (the
      dispatch, `syncVisibilityFades`'s own wake via `fadeTo` at
      `fadeRegistry.ts:131`, and the slot's ready transition via
      `installSlotReadyWake`). Neither deleted line was pinned by a positive
      test, which is why rung 4 could relabel them without touching one and
      why this rung could delete them the same way; one negative assertion
      about the deleted call (`uploadVolumeField.test.ts:84`) went with it,
      per [`testing.md`](../superpowers/conventions/testing.md) — it could no
      longer fail on a real bug once the call it asserted against was gone.
      Both files carry one line naming the dispatch above as the wake.
    - **D8 — the internal-coverage test, stated once because it recurs, and
      the sites that turn on its second clause.** Rule: **delete a redundant
      `requestRender()` only where the same function performs a dispatch that
      covers the same fact.** Both clauses are load-bearing — a same-body
      dispatch about a *different* fact is not coverage, and neither is
      coverage that depends on who called. The second clause is what
      separates the two volume functions (D7, whose dispatch **is** the state
      change the wake announces) from three kept sites where it fails:
      `biasCorrectionSubsystem.ts:276` (`setMode`'s entry wake — dispatches
      nothing itself; its comment, `:272-275`, gained the missing clause — the
      wake is redundant with the settings route today, but coverage is the
      caller's job, not this function's); `startLoop.ts:150` — **the rule's
      worked exception, and the reason the second clause exists**: its
      neighbouring `goLiveNowAction()` dispatch (`:142`) is a `time/`-route
      write in the *same function body*, so clause one alone would predict
      DELETE, but it covers a different fact (a clock snap) — the ignition
      must not depend on the clock snap's route membership, one added comment
      (`startLoop.ts:149`) records why; `syncVisibilityFades.ts:192`'s
      (`syncVisibilityFadeItem`'s) production-dead `animate:false` branch, which fails the test for a
      third reason — it exists to mirror a sibling's wake policy the test
      does not reach at all — and is recorded here as **rung 7's**: it is
      dead-branch hygiene on the FADE_LAYERS bridge (#11: "rung 7 widens to
      full fade-path canonicalization"), not this rung's family.
    - **D9 — the three MIXED sites all keep, and one reclassifies.**
      `wireInput.ts:380` (`onZoom`'s wake, comment at `:378-379`) moves
      ESSENTIAL, not mixed: the census
      read the unconditional wake beside a conditional dispatch as "zoom
      clamped to a no-op," which is false —
      `applyWheelZoom.ts:72-74`'s follow branch mutates
      `clock.followDistanceTarget` **and returns `null`**, so a wheel tick
      while following a body changes real state and dispatches nothing, and
      steady follow after saturation does not itself keep the loop ticking
      (`shouldKeepTicking.ts:130`, deliberately). Without the wake, zooming a
      followed planet from a resting camera would not repaint until something
      else woke the loop. `syncVisibilityFades.ts:152` (batch snap wake) and
      `clipPlayer.ts:206` (fade cue) stay untouched — the first is the paired
      half of a stated contract (the snap path deliberately does not wake, so
      the batch caller wakes once for the batch), the second is a
      continuation vote, not route coverage, and either could turn essential
      again under a future caller shape without anyone noticing today.
    - **D10 — site 6 (#13's earth-tile hand-off) is already the reference
      shape; nothing to build.** `earthTileSubsystem.ts` has no
      `requestRender()` for the staleness fact #13 handed here —
      `isAnimating()` is a pull-vote read at `runFrame.ts:629`, threaded into
      the bag, which is the model D5 measured the label director against.
      Also closes the "no wake vote" half of `current-contracts-map.md:190`'s
      marker-path 🔴: `produceStructureMarkers.ts:57,75` reads
      `fades.opacityOf`, so its ramps ride `fades.isAnyAnimating` and its
      apparent-size fades ride camera motion — there is no gap. The
      shadow-producer/registration half of that 🔴 stays open, unowned by this
      rung.

    **No `WAKE_LAYERS` manifest, row type or walker was built.** Evidence +
    the full accounting: [rung-5 plan](../../superpowers/plans/2026-08-19-wake-vote-fold.md).

16. **Debug derivation is a settings-mechanism consolidation, not a walker —
    ten rulings, no registry** (2026-08-20, ruled in rung 6 — refines #9's
    rung-6 clause, #7's `devOnly` and step-gate clauses, and P1's
    derived-debug deliverable). The W6 sketch
    (`current-contracts-map.md:232`) asked for "derived debug (groups
    PASS_GROUP_TITLES + sliders + sections)". A census of the eight debug
    surfaces in `src/services/engine/`, `src/services/gpu/` and `src/state/`
    found the request already half true and half mis-aimed: the timing
    slots, group buckets and render-toggle list have been a pure projection
    of `(frameProgram × CONTENT_LAYERS)` since renderer unification
    (`frameProgram.ts:247-293`) and a new layer joins all three for zero
    edits; the slider tables (`MILKY_WAY_SLIDER_FIELDS` etc.) are already
    registries their sections `.map()` over. What is genuinely
    O(n)-hand-maintained is the one thing neither the sketch nor
    `current-contracts-map.md`'s loose-spot table named: the **settings
    chain** behind `showPickBuffer` / `showDiskRadiusRing` /
    `showOrbitTrailImpostor` — nine touchpoints apiece, three hand-rolled
    copies of one shape, sitting one field away from `disabledPasses`'s own
    open-world-record pattern (`EngineSettingsState.d.ts:420-430`). Rung 6
    joins that mechanism: one `overlays: Record<DebugOverlayKey, boolean>`
    seeded from `DEBUG_OVERLAY_ROWS` (`src/data/debug/debugOverlayRows.ts`,
    three rows — `pick-buffer`, `disk-radius-ring`, `orbit-trail-impostor`),
    one `setDebugOverlay` reducer, one `selectDebugOverlays` selector, a
    row-driven `DebugOverlaysSection`, one shared `SliderField<K>` type, and
    one generic `DebugTuningSection`. Full accounting:
    [rung-6 plan](../../superpowers/plans/2026-08-20-debug-derivation.md).

    - **D1–D2 — the derivation line is data-vs-JSX; `PASS_GROUP_TITLES`
      stays hand-listed, permanently.** #4 admits "derived debug" and rejects
      "Level 4 schema-generated settings UI" in the same sentence without
      drawing the boundary. Drawn here: a walker may derive DATA a
      hand-written component maps over; it may not emit the component tree.
      `DEBUG_OVERLAY_ROWS` and the existing `timedSlotRowsOf` walk sit on the
      legal side; the DebugPanel's own eleven-child section list sits on the
      illegal side (no row shape — four children take distinct props, seven
      are prop-less containers — so per #10 there is nothing to table).
      `PASS_GROUP_TITLES` (`frameProgram.ts:222-238`) is a third case: it
      carries two facts (a many-to-one title merge AND the display ORDER,
      which is not step order) at the granularity of a frame STEP, not a
      layer or a subsystem, and it is the one artifact #4 keeps
      hand-authored on purpose. It stays as-is, and **no new test was
      added** for it — `frameProgram.test.ts:404-455` already pins the full
      `TIMED_SLOT_GROUPS` title list and four groups' row lists, built from
      the real program × the real `CONTENT_LAYERS`, so a renamed or deleted
      `(target, slab)` step already fails today; the only drift that misses
      (a dead title key matching no emitted group) is inert data, not a bug.
    - **D3 — no `devOnly` field; dev-only-ness moves domains.** No
      `devOnly` field exists (`grep -rn devOnly src/` finds one comment,
      `DebugOverlayRow.d.ts:4`, that itself names this rejection — no
      field). Asked
      what would carry it (two `ContentLayer` rows could) and what would
      read it (nothing — no build-time strip gates `ContentLayer`/
      `frameProgram`/`GPU_HANDLE_ROWS`, and the DebugPanel ships in
      production behind the `d` key), the answer is: a `devOnly` flag would
      be an optional field one row reads for one polarity, the per-row
      exception #10 bans by name. Discharged instead by **membership in
      `DEBUG_OVERLAY_ROWS`**, keyed in its own domain per #12 — absence of a
      row means "not a dev toggle".
    - **D4 — all three booleans keep their capability; the same-fact test
      applied to each contradicts the census's premise.** Rung 5's D8 rule
      (delete a redundant mechanism only where it covers the same FACT, not
      just the same default) fails for all three: `disabledPasses` is a
      one-way override that can only HIDE a layer whose `enabled()` already
      returned true, seeded `{}` = everything on — collapsing
      `showDiskRadiusRing` onto it would ring every selected galaxy in
      production, the opposite of what the census's "fully redundant" claim
      assumed. `showOrbitTrailImpostor` is a draw-time ARGUMENT selecting a
      second pipeline inside a production layer, not a layer at all — the
      generic mechanism would delete the orbit trails entirely, a different
      fact. `showPickBuffer` gates a surface `disabledPasses` cannot reach
      (D5). The consolidation is on the settings CHAIN all three share, not
      on their `enabled()` gates, which differ for essential reasons (a live
      selection, a computed snapshot, a draw-time branch) — a shared "debug
      gate" combinator over those is the fake-unified registry #6 forbids.
    - **D5 — `pickDebugOverlay`'s off-program encoder stays; the deferral
      gets the user's design target and a priced audit.** The layer is
      re-keyed onto `overlays['pick-buffer']` and nothing else about it
      changes: it stays outside `frameProgram`, its own encoder + submit,
      called post-`renderFrame()` at `runFrame.ts:697`
      (`drawPickDebugOverlay.ts`). The reason is a writeBuffer hazard, not a
      style choice: `renderForDebug()` records every pickable layer's
      `drawPick` and submits on its OWN encoder
      (`pickProgram.ts:304-338`), and a `queue.writeBuffer` issued there
      lands on the GPU **before** the outer frame's already-recorded
      commands execute — the same trap `bodyPickRenderer.ts` documents for
      the real pick path. **`pickProgram.ts:317-322`'s "the passes share no
      mutable buffer — no writeBuffer/submit ordering hazard from batching
      them" is scoped to batching slabs WITHIN `renderForDebug`, not the
      outer frame**, and must not be read as refuting the deferral. The
      user's design target for it: pick execution adopts the frame-program
      shape — a **parallel program instance**, the same executor and
      `(target, slab)` vocabulary, different rows and different targets —
      sequenced as a **new ladder rung at the umbrella reassessment** (#9).
      The 2026-08-20 audit that prices it: **SAFE-WITH-CONDITIONS**, eleven
      of twelve pickable rows clean, one **blocker** —
      `zoneOfAvoidanceRenderer.ts:70`'s single `uniformBuffer`, written by
      both `draw` and `drawPick` through one `writeUniforms` with different
      values (reduced viewport + live tweened `upBasis` vs. full canvas +
      `ORIENTATION_FRAMES`), so a naive fold would snap the visible band to
      the destination roll through an orientation transition — the fix
      (~10 lines, `galaxyPickRenderer.ts:161`'s own-buffer pattern) is a
      valid prep refactor on its own merits regardless of the fold. Two of
      the deferral's own founding premises are corrected by the audit: pick
      texture completeness is a non-issue (`submit(E2)` precedes
      `submit(E)`), and the `frustumScratch` re-entrancy worry is
      placement-contingent, not fatal — it does not bite provided the folded
      row sits at `(swap, NEAR0)` immediately before `clipPathDebugLayer`.
      Home: `docs/backlog/2026-08-20-pick-debug-overlay-off-program.md`
      (new).
    - **D6 — the `FOREGROUND_MAX_DISTANCE_MPC` hoist is not this rung's, and
      the fieldStarSphere suspect closes RESOLVED NEGATIVE.** #7 groups the
      hoist with `devOnly` in one bullet, but it is not a debug surface: the
      premise ("~9 layers' `enabled()`") undercounts and mislocates it.
      **10** layers actually gate on it (not ~9, not the outliers sweep's
      "×8" — that counted `foreground:0` ROWS, of which only 6 gate
      explicitly), spanning **three** frame steps
      (`foreground:0·NEAR0`, `hdr·NEAR0`, `swap·NEAR0`) — one step-level gate
      cannot host it as written. `starCatalogLayer.ts:68` is the
      counter-example that proves the cut is a choice, not a default: it
      declares in its own header that it takes **no**
      `FOREGROUND_MAX_DISTANCE_MPC` cut at all. The hoist keeps its existing
      home, `renderer-layer-outliers.md:204`, re-pointed by Task 7 at the
      frame-step work alone (rung 2 shipped without it). Separately,
      `fieldStarSphereLayer` was flagged (`decisions.md:141`,
      `renderer-layer-outliers.md:165`) as the one `foreground:0` row with
      no such gate — read as an omission. **Verified 2026-08-20 and
      RESOLVED NEGATIVE, no gate added.** The layer self-gates on camera
      **POSITION**: `enabled()` requires a catalogued Gaia star within the
      resolve-radius hysteresis band of `ctx.drawCamPos`, measured **~1.45
      AU** (7.04e-12 Mpc at the `STAR_RESOLVE_PX`=4px ON threshold, via
      `resolveDistanceMpc` — `diameterKpc × pxPerRad / (thresholdPx × 1000)`
      at a 720px/60° reference — `fieldStarSphereLayer.ts:165-172`; AU
      conversion via `SCALE_UNITS.AU_TO_MPC ≈ 4.848e-12`,
      `scaleUnits.ts:38`) — roughly **10.5 orders of magnitude** tighter
      than the 0.23 Mpc `FOREGROUND_MAX_DISTANCE_MPC` cut (`0.23 / 7.04e-12
      ≈ 3.27×10¹⁰`). A runtime probe against the real octree + catalog confirmed
      `enabled()` is already `false` at cosmic zoom (camera 0.5 Mpc from the
      Sun). The one pose where the missing gate would matter — camera within
      ~1.5 AU of a star while `cam.distance` ≥ 0.23 Mpc — needs an orbit
      target ≥230 kpc from a camera standing at a star, which no tween or
      resting base produces, and were it reachable, today's behaviour (a
      sphere for the star the camera is parked at) is the correct one
      anyway — the field star's sprite is distance-retired in-shader at
      close range, so the sphere is its only geometry. This is the
      `foreground:0` row whose predicate is already keyed on camera
      POSITION, so it is the standing backlog item
      `docs/backlog/2026-07-30-camera-target-vs-origin-distance-gates.md`'s
      "the permissive reading is what we want" case, reached by
      construction — that file is cited, not modified, by this rung.
    - **D10 — one generic `DebugTuningSection`, user-ruled in, and it sits on
      D2's legal side.** `MilkyWayTuningSection`, `FlowTuningSection` and
      `ZoneOfAvoidanceTuningSection` spelled the same `DebugSection` shell +
      `DebugSlider` `.map()` three times, differing only in registry, values
      and patch fn — D9's `SliderField<K>` argument one level up. Folding
      them does not cross D2's line: D2 bans a walker EMITTING a component
      tree from a schema; this is a hand-written component a hand-written
      caller instantiates with its own data, the same relationship
      `DebugSlider` already has to its three callers. What is banned is
      generated JSX, not shared JSX. `src/components/SettingsPanel/
      FlowRow.tsx` — the explorer panel's flow Intensity slider — stays
      **out**: its `'panel'`-surface rows live in a different component with
      a `disabled` prop and pill-`Slider` chrome the dev panel has no
      analogue for; instantiating the shared component there too would
      render the explorer panel in dev-panel chrome, a visible regression
      dressed as a dedupe.
    - **D7 — the §2/§4 resolution.** `current-contracts-map.md:100,182` (§2,
      Frame assembly) rates debug 🟢 "0 edits for timing slots + debug
      toggles — derived"; `:194` (§4, Cross-cutting registries) and `:210`
      (§6, Assessment, restating the same finding in its ranked summary)
      rate it 🟠 "slider tables + DebugPanel sections + `PASS_GROUP_TITLES`
      hand-listed". All three are about the same file; §2 is right and
      §4/§6 are stale on two of the three counts — the slider tables are
      already registries (D2), and `PASS_GROUP_TITLES` + the DebugPanel
      sections are deliberately hand-authored (D2), not debt. Task 7 sweeps
      all three references.
    - **D8 — the DEV volume fixtures and the infra knobs stay out.** The
      three `debug-*` synthetic cubes are an asset-supply concern gated by
      `import.meta.env.DEV` and `settings.volumes.items[id].enabled`, not
      `settings.debug` — #14 D4 already ruled them out of the `generated`
      family, and nothing about a debug-toggle record changes that.
      `disabledPasses` and `renderStrategy` are the two mechanisms this
      rung's record is modelled on, not a problem to fold in.
    - **D9 — one `SliderField<K>`.** `MilkyWaySliderField`,
      `ZoneOfAvoidanceSliderField` and `FlowSliderField` were identical
      field-for-field bar the key type and flow's extra `surface`
      discriminator — three instances past the second-special-case trigger,
      and the contract sketch already names a single `SliderField`. The
      three become one-line aliases over it; `surface` stays on the flow
      alias alone, since it is one registry's discriminator, not a shared
      capability.

    **No walker, no layer registry, no `devOnly` field was built.** Rungs 7+
    read this as ground truth, superseding #7's and #9's earlier promises.
    _Cost if wrong:_ a `DEBUG_LAYERS` registry parallel to `CONTENT_LAYERS`
    shipping two rows and needing hand-sync with it — the exact artifact
    #13 and #15 rejected twice, and a debug overlay defaulting on in
    production the moment the same-fact test is skipped.

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

- **P1** Bundle contract + engine-core walkers (targets/handles/~~staleness~~/frame
  assembly/derived debug incl. ~~PASS_GROUP_TITLES~~ + TIMED_SLOTS) + adapter
  wrapping the legacy hand-wired style. Behaviour-neutral. **SUPERSEDED by #13
  (2026-08-19)** — no staleness walker; the compare stays resource-owned (rung 3).
  **REFINED by #16 (2026-08-20)** — `PASS_GROUP_TITLES` stays hand-listed, ruled
  permanently (D2); `TIMED_SLOTS` shipped (rung 6, `frameProgram.ts:247-293`).
- **P2** Migrate provers: volumes, star catalog, MW v1-as-is, plus filaments and
  constellations (confirmed clean fits). ~~Deletes `mwAggregateDivisor` param, both
  `runFrame.ts:211-281` mismatch branches~~, hand-maintained debug maps.
  **SUPERSEDED by #13 (2026-08-19)** — rungs 2 (`RenderTargets.reconcile`) and 3
  (`MilkyWayCloud.reconcile`) already deleted both branches; the debug-maps
  deletion **CLOSED by #16 (2026-08-20)** — the maps (`PASS_GROUP_TITLES`, the
  DebugPanel section list) stay hand-authored (D2).
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
