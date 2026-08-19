# Generated-artifact staleness — rung 3 of the engine-composition ladder

**Status.** Complete — shipped on `refactor/generated-staleness` (PR #579), DoD
audit READY 2026-08-19; visual smoke (slider re-densify / tier-switch-once /
idle-nothing) confirmed by the user. **Date.** 2026-08-19.
**Scope.** Rung 3 of the ladder in
[`docs/research/engine/decisions.md`](../../research/engine/decisions.md)
(decision #9): _"**3** generated-artifact staleness helper (`stalenessKey` +
`regenerate`; migrate the ~8 hand sites starting with MW `starCount`)"_, under
decision #10 (row-divergence rule) and decision #12 (rows are identified in
their own domain — no fabricated `key: string`). There is **no separate spec**:
decisions.md is this rung's authority, exactly as it was for rung 2. Every
claim below is cited by `file:line`, verified against this checkout
(`refactor/generated-staleness`, base `be946afe1`) on 2026-08-19.

**Headline.** The survey of the seven staleness sites did not find a family
waiting for a registry. It found a family that is **already resource-owned
everywhere except one site** — `RenderTargets.reconcile` included — and one
compare inlined in the wrong module. So this rung does not build a helper: it
moves that compare into its resource, matching the shape the other six sites
already have, and spends the rest of its weight on the durable record
(decision #13) that says why, and on the checkable condition under which a
registry gets re-opened at rung 4. Decision #9's registry premise is refined,
not silently dropped.

**Ground preparation.** None needed — the ladder itself _is_ the ground-prep
programme (decision #9), and this rung's prerequisites have landed: rung 1 (the
GPU-handle registry, #571) owns construction; rung 2 (#575) shipped
`RenderTargets.reconcile`, which is the shape this rung recognises rather than
generalizes. No prep refactor precedes the tasks below.

**Behaviour-neutral.** Every task preserves the regeneration triggers, the
cadence, the null handling, the throw propagation, and the single-writer
properties exactly. See "How parity is demonstrated" — it is part of the rung's
definition, not an afterthought.

**Evidence base.** The seven-site survey behind the rulings below was done
fresh against `be946afe1` (7 true sites plus a taxonomy of look-alikes: capacity
growth, generation tokens, change-detect memos, ingest machinery). The rulings
restate its conclusions with the code re-checked; the counts in
`current-contracts-map.md` (`:119`, `:207`, `:248`) still say "×8" and "both
`runFrame.ts:211-281` branches" and are stale post-rung-2 — Task 6 fixes them.

## What this rung does and does not touch

**In scope:**

- The Milky-Way star-count branch in the frame loop
  (`runFrame.ts:209-243`) — the anchor site decision #9 names, and the only one
  of the seven whose compare is written in engine code about another module's
  resource.
- `MilkyWayCloud`'s public shape (`src/@types/galaxy/MilkyWayCloud.ts:29-36`)
  and its factory (`milkyWayCloud.ts:87-112`) — the compare's new home.
- The landmines that live in `runFrame`'s comment today and must survive the
  move: the no-shadow-copy rule, the tier single-writer contract, and the
  accepted per-input-event regeneration cost (`runFrame.ts:209-236`).
- The four cross-references that describe this machinery by its old location
  and go stale (or are already false) once the compare moves — listed
  explicitly in finding 3, because a grep over the obvious terms misses one.
- Recording the flow-field counter-example in code, so the next reader meets a
  ruling instead of an apparent inconsistency.
- **decision #13** in decisions.md: the membership analysis, the seven rulings,
  the flow-latch ruling, and the rung-4 re-open condition. This is the rung's
  durable deliverable — the code delta is three files.

**Out of scope, with reasons:**

- **A generated-artifact registry, row type, or walker.** The analysis below is
  the reason; decision #13 carries it forward with a checkable re-open
  condition at rung 4. Building the table now would mean a table with one row,
  whose row is deleted at Track C's F3.
- **The `SubsystemBundle` umbrella and the `ArtifactDecl` union**
  (`baked | generated | fetched | streamed`, decisions #7). Deferred by
  decision #9 until the rungs land. `ASSET_WIRING` is already the `fetched`
  arm, already right (contracts-map §6 🟢) and is not touched.
- **`optional budget` / time-slicing** (decisions #7, #5's fly-by target).
  Deferred to the rung-4 reassessment along with the row shape it would live
  on — see decision #13's third clause.
- **The capacity-growth family** (grow-to-fit ×9: `starPointRenderer.ts:209`,
  `planetRenderer.ts:227`, `orbitTrailRenderer.ts:137`,
  `structureMarkerRenderer.ts:417-429`, `instancedQuadRenderer.ts:336-347`,
  `proceduralDiskRenderer.ts:319`, `bodyPickRenderer.ts:515`,
  `starCatalogPickRenderer.ts:199`, `starCatalogRenderer.ts:361`). Compares
  `<`, not `!==`, and is driven by arriving data size rather than a setting;
  decision #11 already assigns it to the PR-anytime hygiene basket.
- **Generation/race tokens** (`biasCorrectionSubsystem.ts:233,257`) — a
  mismatch there CANCELS superseded async work rather than regenerating.
  Opposite verb, not this family.
- **Change-detect memos and edge detectors** — `labelDirectorSubsystem.ts:471-476`,
  `deriveBodyStates.ts:75-80`, `cameraClock.ts`'s reference-identity re-basing,
  `evaluateClip.ts:119`, the LRU bookkeeping in `textureAtlas.ts:262,278`.
  One-deep memos over pure derivations: no resource, nothing to regenerate.
- **Rungs 4+** — volume ingest (`addVolumeField`, `catalogStore.ts:288-313`),
  wake votes, debug derivation, fade-manifest derivation. Two of the seven
  sites are handed to rungs 4 and 5 by the rulings below.

## The seven sites — scope rulings

| #   | site                                                                    | ruling                                                                                     |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | MW `starCount` → cloud regenerate (`runFrame.ts:209-243`)               | **moves into its resource** — the one site whose compare is not resource-owned             |
| 2   | volume-field palette → LUT re-upload (`volumeFieldRenderer.ts:409-412`) | **stays** — already resource-owned; per-item, not a singleton                              |
| 3   | pick-slab targets vs viewport (`pickProgram.ts:126-155`)                | **target family** — belongs to `RenderTargets`' deferred pick rows, not here               |
| 4   | stale committed tier on a texture slot (`reevaluateDemand.ts:97-106`)   | **rung 4** — its action is one arm of a two-reason `release()`                             |
| 5   | earth planner params vs live tier (`earthTileSubsystem.ts:140-153`)     | **stays** — already resource-owned; hoisting changes when the manifest fetch arms          |
| 6   | earth page table vs uploaded window (`earthTileSubsystem.ts:299-308`)   | **stays**; its wake half is **rung 5** — fused predicate, `null` load-bearing both ways    |
| 7   | swap format vs the swap row (`applySwapFormat.ts:21-23`)                | **stays, and is finished** — event-armed debouncer over an already-declarative rebuild set |

**Site 2 — volume-field palette.** Structurally the purest match after site 1:
the want is `settingsOf(e.id).paletteId`, the fact is `e.residentPaletteId`
seeded at `volumeFieldRenderer.ts:321`, and the regenerate is an in-place
`writePaletteLut` — no destroy. It stays put, and it is the first piece of
evidence for the headline: the compare already lives **inside the resource**, so
nothing outside `volumeFieldRenderer` knows the palette can go stale and there
is no cross-module compare to delete. A registry would move the check OUT,
which is the wrong direction. Secondarily, the artifact is a member of a
dynamic collection (`for (const e of fields.values())`), not a singleton
handle. The ordering landmine (`volumeFieldRenderer.ts:399-408`: the check must
precede the visibility skip gate or a palette changed while the field was off
yields a stale LUT on re-enable) survives untouched precisely because nothing
moves.

**Site 3 — pick slabs.** The closest twin of `RenderTargets.reconcile` in the
codebase: destroy-and-recreate keyed on the pixel size recorded on the
resource, self-healing, no shadow copy — and resource-owned, again. It has a
home already promised: `renderTargets.ts:170-175` ("the pick rows arrive in a
later plan phase"). Its want is viewport pixels rather than a settings value,
and routing it anywhere but `RenderTargets` would fork the render-target family
across two owners. Its own constraints reinforce the call: the map is sparse by
design (a slab with no pickable layer is never inserted, which keeps
`pick:near0` unallocated at N=1), `ensureSlabStaging` (`pickProgram.ts:163-176`)
is size-invariant and must NOT ride the same reconcile, and `destroy()` can
race an in-flight `mapAsync` (`pickProgram.ts:110-118`).

**Site 4 — stale committed tier.** Want and fact are both present and correct
(`row.req(tier).tier` vs `slot.lastRequest()?.tier`), but the action is one arm
of a fused disjunction — `staleTierEvict(...) || row.release?.(ctx)` at
`reevaluateDemand.ts:182` — and the surrounding else-if chain "exactly
partitions the slot states", so splitting the OR is a correctness change, not a
refactor. `release()` also does not close the loop: it drops the slot to idle
and a **later** pass of the same loop re-enqueues at the new tier, so the
regenerate does not record the fact. And it is family-scoped by
`isBodyTextureKey(row.key)` plus a `kind === 'ready'` state gate. Per decision
#10 the fix is at the underlying contract (`AssetSlot` / the demand loop), and
that contract is rung 4's (widened by decision #11 to multi-item ingest
normalization with `upload`/`unload` verbs). Ruled: **rung 4**.

**Site 5 — earth planner params.** The mildest member — a CPU-derived params
object rather than a GPU handle — and resource-owned: the compare is the body
of its accessor (`plannerParams(tier)`, `earthTileSubsystem.ts:140-153`), which
`runFrame` calls **gated on `earthLayer.enabled`**. Hoisting it to an
unconditional per-frame sweep would derive planner params — and, on the first
such call, **arm the manifest fetch** (`earthTileSubsystem.ts:141-149`) — on
frames where the earth layer is off. That is a behaviour change with a network
request attached. It also has a second, async entry point (the `.then` re-calls
`refreshParams(paramsTier ?? tier)`), so an external sweep would not be the
sole writer.

**Site 6 — earth page table.** Resource-owned and doubly ineligible for an
external compare. The window mismatch is OR'd with `rebuildOwed()`
(`earthTileSubsystem.ts:196-198`: `uploaded !== null && (residencyDirty ||
!uploaded.saturated)`), fusing a staleness key with a dirty flag and a
fade-completion predicate — the supplementary-predicate shape decision #10
bans. And `uploaded === null` is load-bearing in **both** directions: "never
uploaded" and `standDown()`'s re-arm signal (`earthTileSubsystem.ts:242`).
Separately, the same staleness fact IS the subsystem's wake vote
(`isAnimating()` returns `rebuildOwed()`), which makes it rung 5's business.

**Site 7 — swap format.** The half-rung-1 site: its rebuild set is already
declarative (`GPU_HANDLE_ROWS` `rebuildOnSwapFormat` →
`buildSwapRenderers.ts:40-49`), and only the compare + no-op guard remain hand
written. Those stay. The compare is the **only** debouncer for a saga that
deliberately carries no payload guard — `watchSwapFormatSaga.ts:6-8` says so in
as many words ("the no-op-if-unchanged guard already lives in `applySwapFormat`,
which sees the live format") — so it is event-armed, not per-frame. Moving it
would run `navigator.gpu.getPreferredCanvasFormat()` every frame and hoist a
five-step ordered rebuild (`context.configure` → `setSwapFormat` →
`buildSwapRenderers` → `labelDirector.attachRenderers` → `requestRender`, plus
the three-way null guard at `applySwapFormat.ts:18-20`) into the frame loop for
a value that moves only on a user toggle. Nothing would be deleted; two things
would change cadence. Ruled: stays, and it is **not** debt — an event-armed
guard over an already-declarative rebuild set is this site's finished state.

## The analysis that produced those rulings

A site could have joined a shared staleness mechanism only if all five held:

1. **The want is a pure function of `EngineState`** — no argument threaded in
   from the call site, no per-item fan-out.
2. **The fact is recorded ON the resource** by `regenerate` itself. No shadow
   copy anywhere (`milkyWayCloud.ts:87-92`).
3. **`regenerate` is synchronous and self-recording** — it completes and
   updates the fact in the same call, so the next compare settles.
4. **The compare is the sole trigger** — no fused disjunction, no
   supplementary state gate, no second writer.
5. **The cadence is per-frame and unconditional.**

The conjunction admits exactly one site — and that is the **result**, not a
gate for future admission. Sites 2, 5 and 6 fail only clauses that describe
_where the compare is called from_, and they fail them because their compare is
already inside the resource. Site 3 is the same, one family over. Sites 4 and 7
fail on genuinely different mechanics and are handed off. So the pattern the
survey actually found is: **the staleness idiom in this codebase is
resource-owned, and site 1 is a compare that was inlined in the wrong module.**
`RenderTargets.reconcile` (`renderTargets.ts:326-338`) — the row rung 2 shipped
and the shape decision #9 pointed at — is the same answer written down first.

**Decision #10, both ends re-evaluated.** The row shape and the underlying
contract were each examined, as the rule requires. The underlying contract is
what was wrong: `MilkyWayCloud` exposes `starCount()` and `regenerate()` as two
halves of a compare it makes the caller assemble, and `runFrame` is the caller
that assembled it. The family shape was already right. So the fix is at the
contract — `MilkyWayCloud` grows the compare — and no row shape is minted to
carry an exception.

**What this costs the ladder, stated plainly.** Decision #9 expected rung 3 to
produce a helper Track C's field bundle would declare against. It does not.
Track C's F1 instead lands the field's generated artifact with the compare in
the field resource, the same way every other artifact does — which is one fewer
indirection, not a gap. The registry question is not closed, only deferred to a
point where it is answerable with evidence; see D3.

## Decisions this rung takes

**D1 — the compare moves into `MilkyWayCloud`, and the fact stays there.** A
caller-side cache of the last count would be the shadow copy that
`milkyWayCloud.ts:87-92` and `MilkyWayCloud.ts:17-22` both exist to forbid: it
could only ever drift from the buffers it describes, and it would silently
break tier re-seeding, which reaches the cloud _through_ the setting. Moving
the compare inside makes that structural — after this rung there is nowhere
outside the module to put a copy. Task 1 keeps the property under test.

**D2 — no registry, no walker, no row type.** The alternative considered and
rejected: `GENERATED_ARTIFACT_ROWS` + a `reconcileGeneratedArtifacts(state)`
sweep, with rows built by a factory closing over each key type. Three things
sank it. It would ship with **one** row, whose resource (the v1 cloud) is
deleted at Track C's F3. A closure-shaped row is opaque — it has nothing for
the umbrella to concatenate and erases `stalenessKey` _as data_, which is the
one thing a future budget/time-slicing walker would need to read. And decision
#5's fly-by artifacts (per-galaxy generation, budgeted, time-sliced,
async-completable) fail clauses 3 and 5 of the analysis above, so the future
rows the registry was being built for are excluded by the very test that
justified it. Building it would have been generality with no instance, present
or promised.

**D3 — the re-open condition, checkable at rung 4.** A generated-artifact row
table is reconsidered at rung 4 **iff** folding `addVolumeField`'s imperative
upload into the `generated` kind — which decision #7 already mandates by name
("imperative upload like `addVolumeField` folds into `generated` explicitly") —
yields **two or more** artifacts that genuinely share the shape after the
ingest contract is normalized. That is the strongest second-row evidence in the
record, and rung 4 is where it becomes concrete rather than speculative. If the
condition holds, the row is **plain data** — `stalenessKey`, `resident` and
`regenerate` readable at the table, never closures — so the umbrella can group
rows and a budget walker can read the key. If it does not hold, the family is
resource-owned and stays that way. Decision #7's "`generated` carries
stalenessKey + optional budget" is deferred to that same reassessment.

**D4 — the flow-field latch stays; it is not unified.** `flowFieldRenderer`
solves the same user-visible problem (count/mode change → reseed) with
`watchFlowReseedSaga` + `createReseedLatch` + `ReconcileEffects.reseedFlow`
(`makeReconcileEffects.ts:45`) and records no fact on the resource. Examined and
deliberately kept, for two semantic reasons:

- Its regenerate is **deferred and conditional on the render path running**.
  The reseed is a compute pass encoded inside `encodeCompute`
  (`flowFieldRenderer.ts:304`), which does not run while flow is disabled or the
  field is unloaded — so the new fact cannot be recorded at compare time
  (clause 3). A compare-based form would need a latch behind it, i.e. the latch
  again with a compare bolted in front.
- The two idioms promise different things. The latch fires **once per arm**; a
  compare **self-heals from any divergence source**. That difference is
  load-bearing for MW — a tier flip re-seeds `settings.milkyWay.starCount`
  (`watchTierSaga.ts:73`) and the compare picks it up with no second writer —
  and deliberately absent for flow, whose saga re-arms on any `setFlow`
  carrying `count`/`mode` even when the value is unchanged
  (`watchFlowReseedSaga.ts:20`). Unifying would silently drop that re-arm:
  re-picking the same mode currently jolts the particles and would stop doing
  so. Arguably an improvement; definitively not behaviour-neutral.

Ruled: two idioms, two shapes, one recorded reason. Task 4 writes it into
`createReseedLatch`'s header, where the apparent inconsistency is visible.

**D5 — the key type is a primitive, and that refines the contract sketch.**
decisions.md's settled sketch types a bundle's planner as `(state, ctx) =>
unknown`, and a reader could infer the same looseness for `stalenessKey`. The
code says otherwise: every recorded fact in the seven sites is a primitive or a
small record compared field-by-field, and the compare is `!==`. A `stalenessKey`
that returns `unknown` needs a comparator, which is the first step toward the
fused predicates decision #10 bans. Recorded in decision #13 as a refinement of
the sketch, so the rung-4 reassessment starts from the more correct shape.

## Findings the executor must know before writing code

1. **`runFrame`'s existing test passes unmodified — that is the parity gate.**
   `runFrame.test.ts:763-797` (`regenerates the cloud when starCount moves, and
leaves it alone when it does not`) drives `runFrame` end to end with a stubbed
   `state.gpu.milkyWayCloud`. **After Task 2 that stub's `reconcile` is what
   runFrame calls**, so the stub must gain the method — but the stub is already
   built by hand in that test and its `regenerate`/`starCount` spies stay. The
   assertions do not change. An assertion that needs editing is the stop signal.
2. **Position in the frame is load-bearing.** The branch sits after
   `state.gpu.renderTargets?.reconcile(...)` (`runFrame.ts:204-207`) and before
   the camera produce step, i.e. **above** `deriveFrameContext`'s
   missing-handle early return; a camera-only-ready frame reaches it today. The
   replacement line goes exactly there, and keeps `?.` (the cloud is
   `MilkyWayCloud | null` until `initGpu` — `EngineGpuHandles.d.ts:285`).
3. **Four cross-references describe this machinery by its old home. Do not rely
   on a grep for `mismatch check` or `starCount()` — one of them contains
   neither string, and it is already false today:**
   - `EngineGpuHandles.d.ts:276-284` — "regenerated in `makeRunTierTransition`
     on a tier swap". That has not been true since the tier bridge moved to the
     saga; `makeRunTierTransition.ts:87-97` says so explicitly. Fix the claim,
     don't just repoint it.
   - `watchTierSaga.ts:19` and `:70-73` — "`runFrame` picks up the write on its
     own next-frame mismatch check".
   - `makeRunTierTransition.ts:87-97` — the deliberate no-regenerate-here note,
     citing `cloud.starCount()` vs the live setting.
   - `MilkyWayCloud.ts:17-22` — states the no-shadow-copy rule in `runFrame`'s
     name; correct about the mechanism, wrong about the location after Task 2.
4. **Do not expand the tier landmine's prose.** `MILKY_WAY_STARS_PER_TIER` and
   the `watchTierSaga` bridge are slated to **die with v1** (decisions.md, Open
   items: "no replacement — field cost is tier-independent"). So the existing
   comments get **repointed and, where possible, shortened**; the durable record
   of the single-writer contract lives in decision #13, not spread across four
   files that are about to lose the mechanism they describe.
5. **`state.settings` is a live getter over the store** (`engine.ts:204`), so
   `runFrame` can read `state.settings.milkyWay.starCount` inline as it does
   today. The runFrame test writes through it (`runFrame.test.ts:788`).
6. **The comparison is `!==` on a number, and stays that way.** Widening it
   (deep equality, `Object.is`, a NaN guard) is a behaviour change smuggled into
   a neutral rung. Today's branch compares two numbers with `!==`; so must
   `reconcile`.
7. **What relocates from `runFrame.ts:209-236`'s 28 comment lines.** Three
   things must survive somewhere: the no-shadow-copy rule (→ `milkyWayCloud.ts`
   / `MilkyWayCloud.ts`, where the contract now lives), the tier single-writer
   note (→ repointed in place, per finding 4), and the accepted per-input-event
   cost (`DebugSlider` fires per input event → full destroy + allocate +
   dispatch per tick, accepted for a dev knob; the fix if it ever matters is
   coalescing on the DebugPanel side, not gating the knob out) → `reconcile`'s
   docblock, since that is the method whose cost it describes. What does NOT
   relocate is the "same shape as the reconcile call just above" sentence: after
   this rung it is the same _method name_, and the reader can see it.
   Comment budget applies — module header ≤10 lines, comments ≤ half the code
   lines. The net comment count across the touched files must go **down**.

No task in this plan moves or renames a `.ts` file, so `npm run move-files` is
not needed; if that changes, use it (`npm run move-files -- <from> <to>`,
`--dry` first) rather than `git mv` + hand-edited imports.

## The contract

```ts
// src/@types/galaxy/MilkyWayCloud.ts — one method added
export type MilkyWayCloud = {
  readonly buffers: () => MilkyWayCloudBuffers;
  /** The starCount the CURRENT `buffers()` snapshot was generated with. */
  readonly starCount: () => number;
  /**
   * Regenerate iff the buffers on screen were generated at a different count.
   * The compare lives here because the fact does: `starCount()` is produced by
   * the generator, and a caller-side copy could only drift from the buffers it
   * describes. Self-healing by construction — it answers a slider drag and a
   * tier re-seed identically, with no second writer.
   */
  readonly reconcile: (wantedCount: number) => void;
  readonly regenerate: (starCount: number) => void;
  readonly destroy: () => void;
};
```

```ts
// src/services/engine/frame/runFrame.ts — the branch's replacement, in full
state.gpu.milkyWayCloud?.reconcile(state.settings.milkyWay.starCount);
```

`regenerate` stays public: `reconcile` is not a wrapper that hides it, and the
tests plus a future unconditional caller still need the unguarded verb.

## How parity is demonstrated

1. **No test assertion changes.** `runFrame.test.ts:763-797` passes with its
   assertions untouched; only its hand-built stub gains the method it now calls
   (finding 1). No existing test is deleted.
2. **Same trigger, same cadence, same failure modes.** The call sits at the
   branch's exact position (finding 2), unconditional, once per frame, with the
   same `?.` null handling and no try/catch added — a throw from `regenerate`
   propagates exactly as it does today. A slider drag regenerates once per input
   event; a tier flip regenerates once, from the saga's re-seed, with
   `makeRunTierTransition` still not calling `regenerate`.
3. **The no-shadow-copy property is tested, not asserted.** Task 1's
   `reconcile regenerates again when the resident count is reset behind the
caller's back` fails the moment anyone caches a last-count — the exact
   regression that would break tier re-seeding, and the property that
   distinguishes this idiom from D4's latch.
4. **Visual smoke over the named behaviours** in the DoD — the two paths with no
   automated pixel assertion (the slider drag and a tier switch).

No `npm run perf` pass is required: the frame loop trades an inline compare for
the same compare one call deeper. If the executor's diff grows beyond that, that
is the signal to measure.

## Tasks

**Execution order (binding).** Task 1 → Task 2 is produce → consume. Tasks 3–6
may run in any order after Task 2 and are independent of each other. Task 7 is
the gate.

### Task 1 — `MilkyWayCloud.reconcile(wantedCount)` (TDD)

**Files:** `src/@types/galaxy/MilkyWayCloud.ts`,
`src/services/engine/galaxyGenerator/v1/milkyWayCloud.ts` (modify),
`tests/services/engine/galaxyGenerator/v1/milkyWayCloud.test.ts` (modify)

**Signature:** the contract above. The body is the two lines
`runFrame.ts:240-242` holds today, moved inside the closure that owns
`currentCount`.

These tests go in the **factory's** test file, against the real
`createMilkyWayCloud` and its stub `GPUDevice` (that file's established mock
pattern, `milkyWayCloud.test.ts:1-40`). They must not restage
`runFrame.test.ts:763-797`'s scenario: that test owns the wiring question ("does
the frame loop call this at all"), these own the compare's semantics. Different
level, different failure mode, no shared numbers.

- [x] Test `reconcile regenerates at the wanted count when it differs from the resident one`
      — assert against the observable the file already uses for
      `regenerate` (`milkyWayCloud.test.ts:156-178`: old buffers destroyed, a
      new generation submitted) and that `starCount()` reports the new count
      afterwards. Catches an inverted argument, which is otherwise silent — the
      cloud would regenerate forever at the count it already holds.
- [x] Test `reconcile does nothing when the resident count already matches` —
      no buffer destroyed, no new submit. The steady-state half; without it,
      every frame destroys and re-allocates.
- [x] Test `reconcile regenerates again when the resident count is reset behind the caller's back`
      — reconcile to a new count, then `regenerate` back to
      the original directly, then reconcile to the new count again and expect a
      second generation. This is the no-shadow-copy property (D1, finding 7) and
      the reason the tier path works; it fails if anyone caches a last-count.
- [x] Implement. `reconcile`'s docblock carries the per-input-event cost note
      (finding 7) — it is the method whose cost that is. The factory's existing
      "two mutable cells" comment (`milkyWayCloud.ts:87-92`) already states the
      no-shadow-copy rule: repoint its last clause at `reconcile` rather than
      writing it again.
- [x] `npm run typecheck` + `npm test -- milkyWayCloud`.
- [x] Commit.

### Task 2 — `runFrame` calls `reconcile`; the hand branch goes

**Files:** `src/services/engine/frame/runFrame.ts` (modify),
`tests/services/engine/frame/runFrame.test.ts` (stub only)

- [x] Replace `runFrame.ts:209-243` — the comment block and the
      `const cloud = …; if (cloud) { … }` branch — with the single line from the
      contract, at that exact position (finding 2). The surviving comment is two
      or three lines: what the step does and why it is unconditional. The
      rationale now lives at the contract.
- [x] `runFrame.test.ts:777-786`'s hand-built cloud stub gains `reconcile`
      delegating to its existing `regenerate`/`currentCount` closure, so the
      test still observes the same spies. **Assertions unmodified** (finding 1,
      parity gate 1). If an assertion needs editing, the wiring is wrong — fix
      the wiring.
- [x] `npm run typecheck` + `npm test -- runFrame`, then `npm test` (the frame
      loop has fixtures beyond its own file).
- [x] Commit.

### Task 3 — Repoint the four stale cross-references

**Files:** `src/@types/galaxy/MilkyWayCloud.ts`,
`src/@types/engine/handles/EngineGpuHandles.d.ts`,
`src/state/tier/watchTierSaga.ts`,
`src/services/engine/wiring/makeRunTierTransition.ts` (modify)

Comment-only, and the budget direction is **down** (finding 4). Every edit is
didactic and timeless — why, not what.

- [x] `EngineGpuHandles.d.ts:276-284` — delete the false claim that the cloud is
      "regenerated in `makeRunTierTransition` on a tier swap"; it is regenerated
      by `reconcile` from the live setting. This one is a bug in the docs, not a
      relocation (finding 3).
- [x] `MilkyWayCloud.ts:17-22` — keep the no-shadow-copy rule (the generator is
      the one place the fact is produced); drop `runFrame`'s name now that the
      compare is a method on this very type. It should get shorter.
- [x] `watchTierSaga.ts:19` and `:70-73` — "`runFrame`'s per-frame mismatch
      check" → the cloud's own `reconcile`. The sentence's real content — the
      saga writes the setting and nothing here talks to the GPU cloud — is
      unchanged and must stay.
- [x] `makeRunTierTransition.ts:87-97` — the deliberate no-regenerate-here note
      is the single-writer contract in prose. Repoint it and **shorten it**: the
      racing-writers argument is now one clause, because the mechanism is a
      named method rather than an inline branch.
- [x] `npm run typecheck` + `npm test`.
- [x] Commit.

### Task 4 — Record the flow-field ruling where the inconsistency is visible

**Files:** `src/utils/createReseedLatch.ts` (modify)

- [x] Add **two or three lines** to the module header: the latch and the
      MW cloud's `reconcile` answer the same question for two subsystems, and
      the latch stays because the reseed is a compute pass encoded only when the
      render path runs, so the fact cannot be recorded at compare time — plus the
      one-shot-per-arm vs self-healing difference (D4). Cite `MilkyWayCloud` by
      name. Do **not** restate D4's full reasoning: that is decisions.md
      content, and this file's budget is a pointer.
- [x] No test — no behaviour changes and a comment is not testable.
- [x] `npm run typecheck`.
- [x] Commit.

### Task 5 — decisions.md gains decision #13

**Files:** `docs/research/engine/decisions.md` (modify)

Rungs 4–7 are written against decisions.md long after this plan has moved to
`plans/completed/`, so the rulings cannot live only here — the same reason rung
2 wrote decision #12. This is the rung's durable deliverable.

- [x] Add **decision #13** carrying: the five-clause membership analysis and its
      conclusion (**the staleness family is resource-owned; site 1 was a compare
      inlined in the wrong module**); the seven per-site rulings, one line each;
      D4 (the flow latch stays, with its reason); D5 (the key is a primitive —
      a refinement of the contract sketch's looser typing).
- [x] Record the **re-open condition** as D3 words it: a generated-artifact row
      table is reconsidered at rung 4 iff the `addVolumeField`-into-`generated`
      fold that decision #7 already mandates yields ≥2 artifacts genuinely
      sharing the shape; if it does, rows are plain data (`stalenessKey` /
      `resident` / `regenerate` readable at the table), never closures. Note in
      the same clause that #7's "`generated` carries stalenessKey + optional
      budget" is deferred to that reassessment.
- [x] Amend #9's rung-3 clause **in place**: the registry premise is refined,
      not dropped — 7 sites surveyed, 1 relocated into its resource, no helper
      built, with a pointer to #13. A reader of #9 alone must not be left
      expecting a registry that does not exist.
- [x] Record the two handoffs where the receiving rung will look for them: rung
      4 inherits site 4 (`reevaluateDemand`'s stale-tier evict) alongside the
      re-open condition; rung 5 inherits site 6's wake half; the target family
      inherits site 3.
- [x] Commit.

### Task 6 — Correct the contracts map's stale staleness counts

**Files:** `docs/research/engine/current-contracts-map.md` (modify)

The map predates rung 2 and still describes a world with two `runFrame`
branches. **Check first** whether an unrelated one-word mermaid-label fix is
already in flight on this file, and rebase onto it rather than reverting it.

- [x] `:119` ("generated (MW cloud, runFrame staleness ifs)") — the frame loop
      has no staleness `if`s after Task 2; the node becomes the resource-owned
      compare.
- [x] `:207` (assessment row 3, "staleness ×8") — 7 surveyed, 6 already
      resource-owned, 1 relocated; adjust the count, the wording and its colour.
- [x] `:248` (the surface→walker table row citing "both `runFrame.ts:211-281`
      branches") — the divisor branch went in rung 2 and the MW branch goes
      here. Its "bundle field / walker" cell must now match decision #13, not
      promise a `generated{stalenessKey}` sweep that this rung declined to
      build.
- [x] Commit.

### Task 7 — Full gate + visual smoke

- [x] `npm run typecheck` (both tsconfigs) + `npm test` — green, no skips added.
- [x] Dev-server smoke, with the user's eyes (this task cannot self-certify
      pixels): drag the DebugPanel's Milky-Way `starCount` slider across its
      range. The cloud must re-densify continuously with no console error and no
      frozen frame — the same responsiveness as `main`, since the cost is
      unchanged.
- [x] Switch tiers and confirm the cloud regenerates **once** at the new budget
      — the single-writer path (`watchTierSaga` re-seeds the setting,
      `makeRunTierTransition` stays out of it). A double regeneration or a cloud
      stuck at the old density is the failure this smoke exists for.
- [x] Leave the app idle at a fixed camera for ~10 s with the Milky Way visible:
      no regeneration should occur. Watch for GPU-memory growth or a periodic
      hitch.
- [x] Commit (if any smoke-driven fixes were needed).

## Definition of Done

- [x] `MilkyWayCloud` declares `reconcile(wantedCount: number)`, implemented in
      `milkyWayCloud.ts`, with the three tests from Task 1 present and passing —
      including the reset-behind-the-caller's-back one.
- [x] `runFrame.ts` contains **no `state.gpu.milkyWayCloud` reference outside
      the single `reconcile` call** and no staleness compare, at the position the
      deleted branch occupied.
- [x] `runFrame.test.ts:763-797` passes with its **assertions** unmodified (its
      stub gains `reconcile`); no existing test anywhere was deleted by this rung.
- [x] No registry, row type, or walker was added — the deliberate outcome
      (D2/D3), and the thing a reviewer expecting decision #9's literal reading
      must be able to find explained in decisions.md rather than inferred.
- [x] `EngineGpuHandles.d.ts`'s false "regenerated in `makeRunTierTransition`"
      claim is gone; the three other cross-references point at the cloud's own
      `reconcile`; the net comment count across the touched files went **down**.
- [x] `createReseedLatch`'s header names the ruling that keeps it distinct from
      the staleness compare.
- [x] `docs/research/engine/decisions.md` ships in this PR with decision #13
      (analysis + conclusion, seven rulings, flow-latch ruling, primitive-key
      refinement, the rung-4 re-open condition, the three handoffs) and #9's
      rung-3 clause amended in place; `current-contracts-map.md`'s three
      staleness lines match the post-rung-2, post-rung-3 world. Rungs 4–7 must
      read the current north star from decisions.md alone, without this plan file.
- [x] Named observable behaviours for the manual smoke pass: the `starCount`
      slider re-densifies the Milky Way continuously across its range with no
      console error; a tier switch regenerates the cloud exactly once at the new
      budget; an idle scene regenerates nothing.
- [x] Sizing note for the ladder, not a gate: rung 3 arrives as 7 tasks, of
      which **two** touch behaviour-bearing code. Decision #9 sized it as a
      mini-plan expecting "~8 hand sites" to migrate onto a new helper; the
      survey found 7 sites, 6 already in the target shape, and no helper worth
      building. The plan's mass moved from migration to adjudication. Rungs 4–7
      should expect the same possibility wherever a "family" named in #9 turns
      out to be heterogeneous — the rung's deliverable may legitimately be a
      ruling plus a small relocation.
- [x] Deferral boundary — a reviewer should NOT expect to find, in this PR: a
      generated-artifact registry, row type, or walker (D2, re-opened at rung 4
      under D3's condition); the `SubsystemBundle` umbrella or the `ArtifactDecl`
      union; a `budget` field or any time-slicing; migrations of sites 2–7 (each
      ruled and recorded, three with a named receiving rung); the flow-field
      latch's removal; the capacity-growth hygiene basket (decision #11:
      PR-anytime); any change to `ASSET_WIRING`.
