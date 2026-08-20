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

    | class             | count  | outcome                                                                              |
    | ----------------- | ------ | ------------------------------------------------------------------------------------ |
    | MECHANISM         | 3      | untouched — `watchWakeSaga.ts:54`, `watchSelectionWakeSaga.ts:26`, `runFrame.ts:716` |
    | ESSENTIAL         | 15     | untouched                                                                            |
    | REDUNDANT-COVERED | 5      | 2 deleted (volume pair, D7), 3 kept (D8)                                             |
    | VOTE/PREDICATE    | 2      | 1 folded (label director, D5), 1 handed to rung 8 (D6)                               |
    | MIXED / uncertain | 3      | all kept; 1 reclassified ESSENTIAL (D8, D9)                                          |
    | **total**         | **28** | **1 folded · 2 deleted · 7 kept · 18 untouched**                                     |

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
      unchanged (`decisions.md:220`, "No registry, no walker, no row type was
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
      dispatch about a _different_ fact is not coverage, and neither is
      coverage that depends on who called. The second clause is what
      separates the two volume functions (D7, whose dispatch **is** the state
      change the wake announces) from three kept sites where it fails:
      `biasCorrectionSubsystem.ts:276` (`setMode`'s entry wake — dispatches
      nothing itself; its comment, `:272-275`, gained the missing clause — the
      wake is redundant with the settings route today, but coverage is the
      caller's job, not this function's); `startLoop.ts:150` — **the rule's
      worked exception, and the reason the second clause exists**: its
      neighbouring `goLiveNowAction()` dispatch (`:142`) is a `time/`-route
      write in the _same function body_, so clause one alone would predict
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
    open-world-record pattern (`EngineSettingsState.d.ts:409-421`). Rung 6
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
      `fieldStarSphereLayer` was flagged (`decisions.md:154`,
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

17. **Umbrella reassessment: `SubsystemBundle` stays deferred, re-put after
    rungs 7 and 8** (2026-08-20 — the reassessment decision #9 promised once
    the rungs land). Rungs 1–6's own outcomes (#12–#16) are the evidence,
    reviewed rung by rung: a registry was minted only where rows genuinely
    repeat — rung 1's `GPU_HANDLE_ROWS` (handle construct/teardown, PR #571),
    rung 2's render-target contribution rows (PR #575), rung 6's
    `DEBUG_OVERLAY_ROWS` (PR #598) — and explicitly declined everywhere a
    census found too few members: rung 3's staleness idiom (7 sites,
    resource-owned, PR #579 — #13), rung 4's ingest fold (5 copies → 1
    function, no row table, PR #583 — #14 D4), rung 5's wake-vote fold (1
    `anim`-bag field, no `WAKE_LAYERS` manifest, PR #591 — #15 D1/D4). Six
    rungs in, no cross-family `SubsystemBundle`-shaped type was ever needed to
    ship any of them — each rung's family found its own row shape in its own
    domain, per #12.

    **USER RULING — the commit/close call is DEFERRED again.** Not decided
    now: whether `SubsystemBundle` (the "## The contract (settled sketch)"
    block below) ever gets built, stays reference-only, or is formally
    dropped. Re-put after rung 7 (fade rows) and rung 8 (label unification)
    land — the two rungs #9's ladder didn't yet have outcomes for when this
    reassessment ran. #12's discipline stands unchanged as the working
    umbrella in the meantime: rows are keyed in their own domain (rung 1's
    `EngineGpuHandles` field name, rung 2's `RenderTargetSpec.id`, …),
    subsystem attribution rides the contributing bundle, never the row. Its
    reopen condition: a consumer needing cross-family enumeration of one
    subsystem's rows reopens the umbrella question early, ahead of rungs
    7/8 landing.

    **USER RULING — sequencing.** Rung 7 next, then rung 8. The Track B plan
    (galaxy-field-renderer extraction, spec already written at
    `docs/superpowers/specs/2026-08-17-galaxy-field-renderer-extraction-design.md`)
    follows. Track C (the analytic Milky Way landing) stays blocked on Track
    B alone — #9's "Track C gates on B + rungs 1–3 only" is unchanged by this
    reassessment; rungs 7/8 are not a Track C gate. Rung 9 (the pick-program
    parallel-frame-program fold — #16 D5's design target, priced
    SAFE-WITH-CONDITIONS at
    `docs/backlog/2026-08-20-pick-debug-overlay-off-program.md`) sequences at
    convenience — no dependency forces it before or after Track B/C.

    **Carried forward, re-put alongside the umbrella call after rungs 7/8:**
    - The `generated`-kind `stalenessKey` + optional `budget` clause (#7,
      re-deferred by #13 and again by #14 D4): the family has exactly one
      member today (the MW cloud, `MilkyWayCloud.reconcile`). Track C's field
      renderer may be the second genuine keyed `generated` artifact — #13's
      own reopen condition — which is the tripwire to watch, not a rung to
      schedule pre-emptively.
    - Tier-response duplication (#14 D5): `makeRunTierTransition.ts:56-88`
      and `reevaluateDemand.ts:102` hand-encode the same "does this family
      respond to a tier change" test twice, neither derivable from
      `ASSET_WIRING`. Recommended disposition: a backlog capture, not a
      rung — no third instance has appeared to make it a family yet.
    - The wake hand-maintained-disjunction question (#15 D4): three fields,
      three producers, no shared row shape today; #13's clauses fail for
      wake exactly as they did for staleness. Stays hand-folded. Reopens on
      a second vote-shaped wake (a new `anim`-bag contributor whose vote is
      itself computed from a per-frame planner, the same shape as the label
      director's fold) — not before.

    No code changed by this decision. Evidence: rungs 1–6's own decisions
    (#12–#16) and their linked plans; `current-contracts-map.md` and
    `renderer-layer-outliers.md` re-swept 2026-08-20 confirm no rung produced
    an unrecorded umbrella-shaped artifact.

18. **Fade rows: one derivation, one contract narrowing, seven canonical
    migrations — no fade registry** (2026-08-20, ruled in rung 7 — refines
    #9's rung-7 clause as widened by #11 `:143-145`, and takes the item #15 D8
    handed here). Both counts the research record carried into this rung were
    wrong, and correcting them changed what the rung is about: the family's
    defect is not row bookkeeping, it is that most of the keys a tour can
    address reach no pixel.

    **The dead set is five keys — not the five on record.**
    `renderer-layer-outliers.md:100` listed `structureRing` among them. It has
    two live production readers (`produceStructureMarkers.ts:75`,
    `produceStructureLabels.ts:120`) and reads its clip channel at
    `produceStructureMarkers.ts:65` — one of the best-wired keys in the family,
    not a dead one — and `scaleBar` was missing. The correct set, zero
    production readers of the registered opacity: `proceduralDisks`,
    `texturedDisks`, `scaleBar`, `starCatalogLabel`, `bodyLabel`
    (`fadeLayers.ts:108,115,153,166,174`). **Method**, recorded so the next
    rung re-runs it instead of re-guessing: enumerate every `opacityOf(` and
    `resolveLayerOpacity(` call site under `src/` and match against the 18
    `FADE_LAYERS` rows (`fadeLayers.ts:97-317`); these five have no match.
    `current-contracts-map.md:189`'s "**2** fade rows have no consumer" was
    incomplete rather than wrong — it counted only `fadeLayers.ts`'s two
    self-admissions.

    **`fade()` reached 7 of the 18 keys; 11 were inert.** Stated once and at
    both scopes, because the dead rows and the bypassed rows are one defect: a
    key with no reader and a key whose only reader skips the clip channel are
    both keys a tour author addresses and gets nothing from. `fade()` writes
    only the `clipOpacity` channel (`effectHelpers.ts:387-393`,
    `applySceneEffect.ts:165-172`, `clipPlayer.ts:198-206`), and that channel
    reaches pixels through exactly two doors — `clipFactorFor` inside
    `resolveLayerOpacity` (`focusRecession.ts:149-152`), and three hand-rolled
    producer calls (D10). **Reachable, 7:** `filaments`, `orbitTrails`,
    `volumesMaster`, `zoneOfAvoidance` (the canonical consumers) plus
    `surveyLabel`, `structureRing`, `structureLabel` (the producers).
    **Inert, 11:** six whose only reader is a raw `opacityOf` —
    `milkyWayDisk`, `milkyWayLabel`, `survey`, `constellations`, `flow`,
    `volumeField` — plus the five dead-set keys above. D8 moves the six
    raw-reader keys across, taking `fade()` from 7 keys to **13**; the five
    dead-set keys stay inert by ruling (D12, D13).

    That is not abstract. `src/data/animation/clips/cosmicFlows.ts` — shipped,
    in the clip registry (`clipRegistry.ts:61`, `grandTour.ts:125`) — scripts
    inert keys in three places: the pre-roll load mask `fade(['flow'], 0, 0)`
    at `:78`, so the flow field pops in half-loaded instead of being revealed
    behind it (the idiom the file's own header documents at `:21-30`); beat A's
    crossfade at `:86`, where neither side moves; and beat D's fade-to-black at
    `:96`, where only `structureRing` and `surveyLabel` obey while the flow
    field and the Milky Way stay lit. The survey did not report this, and it is
    why this rung is not a purely behaviour-neutral PR (D9).
    - **D1 — the record is corrected in the branch that acts on it.**
      `renderer-layer-outliers.md:98-101` and
      `current-contracts-map.md:188-189,209,234` are cited by #11 and by rung
      8's survey, so both are corrected here, with the enumeration method
      attached, rather than left to drift into the next rung's premises.
    - **D2 — `FADE_ROW` is DERIVED; `VISIBILITY_ACTION_ROW` rows grow a
      `writes` field.** The pair is a true inverse — each of the 15 `FADE_ROW`
      entries is `creator.type → key`, and each non-empty
      `VISIBILITY_ACTION_ROW` row calls exactly one creator — hand-written in a
      second file only because the creator was buried inside a closure. Lifted
      to row data (`writes: { type } | null`, required rather than optional so
      a new key must state its stance — the discipline
      `fadeIdToVisibilityKey`'s `satisfies Record<…>` already uses), the
      inverse falls out: `FADE_ROW` is now derived in place
      (`visibilityActionRow.ts:183-189`) and `watchFadesSaga.ts` imports it.
      Not the per-row exception #10 bans — 15 of 18 rows carry it, so it names
      a capability the family shares. **Rejected: deriving `actions` from
      `writes` too.** It needs a payload taxonomy — 8 rows are `creator(on)`, 6
      map over `settings.X.items`, `volumeField` is
      `writeVolumeField({ id, patch })` — a 3-arm tagged union over 15 rows to
      save ~20 lines, and per #10 the misfit is in the _contract_
      (`writeVolumeField`'s patch shape versus the others' flat shape), which
      is a settings-slice change, not a behaviour-neutral rung. **Rejected:
      deriving `writes` from `actions` at runtime**
      (`actions(true, settings)[0]?.type`) — per-item factories return `[]`
      over an empty settings record, so the derivation would be
      seeded-state-dependent, and a silently missing `FADE_ROW` entry is the
      exact failure this rung exists to remove. The new `src/store/` →
      `src/services/animation/` import edge was checked, not assumed:
      `visibilityActionRow.ts` imports only `@types` + `settingsSlice` — no
      engine, no GPU — so the saga's stated "keeps the store layer free of
      engine imports" constraint holds verbatim, and `settingsSlice` imports
      nothing from `store/`, so there is no cycle.
    - **D3 — `FADE_LAYERS` and `VISIBILITY_ACTION_ROW` do not merge.
      JUSTIFY.** Both are keyed by `VisibilityLayerKey` and their
      registration-only subsets coincide exactly, which invites a merge. Two
      facts refuse it. **Layering:** `FADE_LAYERS` rows close over
      `EngineState` (`fadeLayers.ts:226,242,290,306-315`), so merging drags the
      engine into the store's saga graph — the one constraint D2 just
      preserved. **Item domains differ:** `FADE_LAYERS.survey.expand` yields
      the compile-time `GALAXY_CATALOG_IDS`, `VISIBILITY_ACTION_ROW.survey`
      enumerates `settings.galaxyCatalogs.items` at dispatch time, so a merged
      row must pick one and change behaviour for whichever loses. The
      coincidence they _do_ share — `row.intent === undefined` ⟺
      `row.writes === null` — is pinned by one structural test instead, which
      also replaced a hand-listed key restatement that had already drifted: it
      named 11 of the actual 15 intent keys, so four rows had silently stopped
      being covered. Net: stronger coverage, fewer lines.
    - **D4 — `fadeIdToVisibilityKey` is NOT derived from
      `FADE_LAYERS.handle()`. JUSTIFY, refuted by a counterexample.**
      `VISIBILITY_KEY_BY_KIND.overlay` is deliberately `undefined`
      (`fadeIdToVisibilityKey.ts:87-92`) while `FADE_LAYERS` _does_ map
      `{kind:'overlay',id}` to `proceduralDisks`/`texturedDisks`
      (`fadeLayers.ts:106-119`). That divergence is the hand table's whole
      point: `:87-92` is a stance — "no clip cue addresses the always-on disk
      overlays" — and a derived inverse would silently overwrite it. **The cost
      is armed, not present.** Those two handles have zero readers today, so no
      `{kind:'overlay'}` `FadeId` ever reaches `resolveLayerOpacity`; the trap
      springs the day a disk overlay gets wired up in some later rung, when a
      derived inverse starts applying a clip factor to an always-on overlay and
      nobody reviewing that rung is looking here. Recorded so it is not
      re-opened as "it costs nothing".
    - **D5 — the four `FadeId`-keyed presentation tables stay four tables.
      JUSTIFY.** `fadeIdToVisibilityKey.ts:54-94` and
      `focusRecession.ts:77-116` are structurally identical — same two key
      domains, same `satisfies Record<…>` guard, same two-way branch,
      duplicated verbatim. Merging them into one `{ clipKey, recession }` row
      deletes ~8 lines of skeleton and braids two concerns that vary
      independently: the clip key is an _address in the tour vocabulary_, the
      recession target is a _visually tuned number_ (`focusRecession.ts:66-72`
      marks them as not-final placeholders). Under `simplicity.md` that is
      complecting for a skeleton saving.
    - **D6 — `scopedVisibilityActions` keeps its two tables. JUSTIFY.** (The
      survey's "1 row so far" was also wrong: `LABEL_SLICES` has three rows and
      `FAMILIES` three.) Post-D2, `FAMILIES`' handlers could read
      `VISIBILITY_ACTION_ROW.<key>.writes` instead of importing three creators
      directly — but only by re-introducing the payload taxonomy D2 rejected.
      Three imports is the cheaper truth. `LABEL_SLICES` already delegates to
      `VISIBILITY_ACTION_ROW`, so it is not a duplicate at all; it is the
      correct shape.
    - **D7 — the canonical path costs one line:
      `resolveLayerOpacity(state, ctx, h)`.** The #10 move — the row didn't
      fit, so the contract changed, for all rows rather than one. Every
      canonical call used to spell out five arguments, four of them the same
      two ambient bags, at 7 formatted lines apiece; that cost is _why_ the raw
      one-liner kept winning at new sites. The signature now takes
      `Pick<EngineState, 'subsystems'>` and
      `Pick<ReadyFrameContext, 'focusBlend' | 'nowMs'>` — `Pick` rather than
      the full types, so it stays testable with two small literals and the
      dependency stays honest — and `clip` stops being optional, since
      `state.subsystems.clipPlayer` is always present, which also deleted the
      `clip === undefined ? 1 : …` arm. `focusRecession` and
      `recessionTargetFor` stay pure and unchanged; only the composition sugar
      takes the bags, which is what it is for.
    - **D8 — the raw-vs-canonical rule, stated once, here.** It classifies by
      **what the site's answer controls**, not by the shape of the expression:

      > `opacityOf` is the layer's **intent** fade — toggle, load-in, tier
      > swap. Recession and clip are **presentation** factors: they dim a layer
      > that is still fully enabled and fully resident. So:
      >
      > 1. **A value the viewer sees** — a drawn alpha, and any `> 0` /
      >    `!== 0` skip derived from _that same drawn value_ — resolves through
      >    `resolveLayerOpacity`.
      > 2. **A value that decides whether the layer's work happens at all** —
      >    does the pass run, does data stay resident, does the fade-out tail
      >    keep drawing, does this source claim a hit — reads `opacityOf` raw.
      >    Keying these on recession or clip would unload, stall or unclick a
      >    layer that a focus tween or a clip cue merely _dimmed_.
      > 3. **Per-instance producers** compose the three factors by hand,
      >    because they apply a focused-instance exemption _between_ them
      >    (D10).

      The three buckets partition all **21** raw production `opacityOf` sites
      under `src/` — **7 migrate, 9 stay raw, 5 are per-instance producers** —
      against a record that said 5 sites skipping "recession and the clip
      channel", wrong on the count and on both halves of the claim (D1). Two
      sites the rule has to be right about, ruled explicitly:
      - **`produceMilkyWayLabel.ts:69` splits in two**, and the site
        legitimately grows by one line. One binding served both the gate
        (`!labelEnabled && layerOpacity === 0` → emit nothing) and the drawn
        alpha; those fall in different buckets. Merging them either way is
        wrong — resolve the gate and a clip fade to 0 truncates a disabled
        label's fade-out tail; leave the alpha raw and beat D's `milkyWayLabel`
        cue stays inert.
      - **`galaxyPointSpritesLayer.ts:191` stays raw**, and is not edited by
        this rung. It is the `drawPick` pick filter, and the family already
        rules that _picking follows intent, not pixels_
        (`deriveSourceMasks.ts:25-27`) — which is why the pick mask reads
        `enabled` alone and never consults a fade. A clip `fade()` is
        explicitly not intent: `cosmicFlows.ts:34-40` states its crossfade
        "does NOT dispatch `hide(['survey'])` — the intent store is untouched."
        Resolving `:191` would let a clip cue silently revoke pick eligibility
        from a layer the user still has enabled, contradicting both. The file's
        own coherence claim survives untouched, because the term it is about —
        the deep-zoom band `surveyFade` — stays in the expression.

      Recession is provably `1` at all seven migrated sites: `RECESSION_BY_KIND`
      and `RECESSION_BY_LABEL_LAYER` (`focusRecession.ts:77-116`) give
      `undefined` for every kind they read, so outside a playing clip the
      migration is a no-op by construction rather than by inspection. **That
      scoping does not generalize, and rung 8 must not inherit "raw ⇒ recession
      is 1" as a rule**: six other raw sites read ids that _do_ recede —
      `{kind:'structure'}` and the label layers at 0.25,
      `{volumesMaster}` at 0.15 — five of them the per-instance producers that
      compose recession themselves (D10), the sixth a liveness gate that must
      key on the bare toggle. Nothing is lost at any of the six; the general
      statement is simply false.

    - **D9 — un-breaking `cosmicFlows` is the rung's one behaviour change, and
      it is user-gated.** D8's migration makes `fade()` reach `survey`, `flow`,
      `milkyWayDisk`, `milkyWayLabel`, `constellations` and `volumeField` for
      the first time, which changes three user-visible moments in a shipped
      tour: the pre-roll mask starts masking (so the flow field stops popping
      in half-loaded — the least tuned-around of the three, because nobody has
      ever seen it work), beat A becomes an actual crossfade, and beat D takes
      the flow field and the Milky Way disk toward black alongside the
      structure rings and survey labels. The cues were authored to do exactly
      this, so it is a fix — but the beats were tuned _with the no-op in
      place_, which makes it a visual question, not a correctness one. Not in
      the ask: pickability (D8). So the migration is the **last commit of the
      branch**, with the checkpoint immediately before it: per `simplicity.md`'s
      landing rule a "the beats look worse now" verdict **halts** the commit
      rather than being argued past on process momentum, and a park ruling is a
      one-commit drop — the neutral commits touch a disjoint file set, so
      nothing is built on top of it. If it is parked, the finding above stands
      recorded here and the cue-side fix — re-tuning or deleting the cues —
      becomes a tour-authoring item.
    - **D10 — the three per-instance producers keep their hand-written
      `clipOpacityOf('literal')`. JUSTIFY.** `produceStructureMarkers.ts:65`,
      `produceStructureLabels.ts:91` and `produceFamousLabels.ts:218` each
      hoist a single `clipOpacityOf(<literal key>)` _out of_ their per-instance
      loop and multiply it in alongside a focused-instance exemption — the
      split `focusRecession.ts:164-166` documents as the per-instance contract.
      Routing them through the private `clipFactorFor` would mean synthesizing
      a representative `FadeId` for a whole category (`{kind:'structure',
id: <which?>}`) to recover a key the producer already knows, or moving
      the call back inside the loop. Three literals, adjacent to the
      `opacityOf` calls that share their key, are the cheaper truth.
    - **D11 — `syncVisibilityFadeItem` loses its `animate` parameter, which
      discharges #15 D8.** DELETE by narrowing the contract, not by deleting a
      line: dropping only the production-dead `animate: false` arm would leave
      the `setImmediate` path reachable and now silently wake-less, a
      starvation bug planted for a future caller. Per #10 the fix is at the
      contract — the entry's sole production caller passes `{ animate: true }`
      (`galaxyCatalogSourceRegistry.ts:233`), so the parameter goes and the
      entry passes that literal on to `applyIntent`, whose `opts` does not
      narrow with it. Neutrality is explicit, not inferred. The batch bridge
      `syncVisibilityFades` **keeps** `animate`: it has real snap-path callers
      and its own "why the wake is asymmetric" contract, which survives; only
      the mirror comment went, and the test that drove the dead branch went
      with it, per `testing.md`.
    - **D12 — `starCatalogLabel` / `bodyLabel`: rung 8 owns the wire, and the
      backlog item is discharged here. Addressed to rung 8's author.** Ruling:
      **rung 7 does not finish the wire; the two rows stay exactly as they
      are.** The alternative the backlog detail put on the table — "narrow the
      fade manifest… that breaks the type-equality test on purpose" — is
      **ruled against, not overlooked**: the key-set equality (`FADE_LAYERS`
      keys ≡ `VisibilityLayerKey`) is what makes a newly minted key a build
      failure until it gets a controller, the same invariant D13 keeps, and it
      is not worth unpicking to delete two rows. Both keys are also members of
      `LAYER_GROUPS.labels` (`expandVisibilityLayers.ts:34`), whose stated
      promise is totality over the label keys, so removing either breaks
      `hide(['labels'])`. Their intent path already works end to end —
      `VISIBILITY_ACTION_ROW.starCatalogLabel` → `setStarCatalogLabelEnabled` →
      `foregroundLabelsLayer.ts:376-377` reads the settings leaf — so only the
      fade _animation_ goes nowhere. The live question is who finishes it, and
      the answer is rung 8, for four reasons: (1) finishing means teaching
      `foregroundLabelsLayer` — 812 lines rung 8 is chartered to dissolve into
      `LabelProducer`s — to multiply the handle opacity into its caption
      envelope, i.e. code rung 8 deletes; (2) all three existing
      `LabelProducer`s already reach the registry, so the wire falls out of that
      rewrite for free; (3) rung 7's own D8 migration cannot reach it, because
      the captions run a private declutter + temporal envelope and a naive
      multiply would double-count against a dimming authority the layer already
      owns — the same argument `RECESSION_BY_LABEL_LAYER`'s
      `starCatalog`/`body: undefined` rows record (`focusRecession.ts:88-97`);
      (4) leaving them costs zero LOC and zero risk, so there is no "fix it now
      while we're here" saving to weigh against the rework. What rung 7 did
      instead, two things: deleted the 22 lines of research narrative and TODO
      at `fadeLayers.ts:151-165,177-183` — `comments.md` bans both by name —
      leaving one landmine line on each row naming the gap; and **discharged
      the backlog item this rung picked up**. `docs/BACKLOG.md`'s "Two label
      layers register fade handles nothing reads" index line and its detail
      file `docs/backlog/2026-07-29-unread-caption-fade-handles.md` are deleted
      in this branch per the backlog-hygiene convention, with this decision as
      the source of truth. Not struck through, not re-filed; the completion
      record is the git log plus this entry.
    - **D13 — the three registration-only rows stay registered. JUSTIFY.**
      `proceduralDisks`, `texturedDisks` and `scaleBar` register controllers
      nothing reads and nothing drives (no `intent`, so `syncVisibilityFades`
      skips them). Deleting them from `FADE_LAYERS` while keeping their
      `VisibilityLayerKey` membership is safe in isolation — nothing calls
      `fadeTo` on them, so the `FadeRegistry.fadeTo` throw is not a risk — but
      it buys ~14 lines at the cost of the invariant that makes the family
      safe: keys ≡ `VisibilityLayerKey` means a newly minted key is a
      build/test failure until it gets a controller. Weakening that to a subset
      relation to delete three inert rows is the wrong trade. This closes
      `current-contracts-map.md:189`'s 🔴 as **ACCEPTED**, not open.
    - **D14 — what rung 7 did not build.** No `FADE_ROW` walker, no fade
      registry, no row type beyond the `writes` field on an existing table, no
      umbrella `SubsystemBundle`, no `fades?: readonly FadeLayer[]` bundle
      field. #7's bundle-concatenation shape is a Track C / umbrella concern;
      this rung only ensures the rows it would concatenate are already derived
      from one source where they can be. A reader of #9 alone should not expect
      a registry here — cf. #13, #14, #15, #16, all of which shipped the same
      verdict.
    - **D15 — the D8 rule's home is this decision, not `focusRecession.ts`'s
      header.** The obvious home was that module header. It stood at lines 1-54
      against `comments.md`'s **≤10-line** budget over a file with ~45 lines of
      code (whole-file ratio ≈ 98 comment lines to 45, against "≤ half the code
      lines"); adding four more lines to a header 5× over budget fails the
      convention twice and "code is liability" once. So the rule's full text
      lives here — a plan/spec artifact is where `comments.md` puts
      classification rationale — and the header was rewritten to ≤10 lines in
      the same task that changed the signature (D7). What survived is the
      material a reader cannot recover from the code: the compose-don't-braid
      landmine (recession must NOT be folded into `FadeRegistry` — the blend's
      authoritative home is `structureFocusSubsystem`, and caching it here is
      the stale-mirror bug class); why membership is `satisfies Record<…>` and
      not a `switch` (this tsconfig has no `noImplicitReturns`, so a
      `default`-less switch gives no exhaustiveness guarantee at all); and a
      one-line pointer here. ≈ −44 comment lines.
      `RECESSION_BY_LABEL_LAYER`'s rationale at `:88-97` is a _row_ comment,
      not header, and stays — D12 leans on it.

    **No fade registry, no `FADE_ROW` walker and no bundle `fades` field was
    built; one existing table grew one required field.** Evidence + the full
    accounting: [rung-7 plan](../../superpowers/plans/2026-08-20-fade-rows.md).
    _Cost if wrong:_ the derived `FADE_ROW` loses an entry the moment a future
    row carries an `intent` with `writes: null` — which is exactly what D3's
    structural test fails on.

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
