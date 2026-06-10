# Render-wake consolidation — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (fresh implementer subagent per task + spec + quality reviews). Each implementer
> EDITS FILES ONLY; the **main thread** runs `npm test` / `npm run typecheck` and
> commits. Dispatch implementers with `run_in_background: true`.

## Goal

Move the `requestRender()` obligation from ~35 call sites into the subsystems
that own each change channel. The scheduler
(`src/services/engine/subsystems/renderScheduler.ts`) is untouched — it stays a
dumb coalescing rAF wrapper. What changes is *who calls it*: today every setter,
slot subscriber, and helper must remember the trailing wake, and a forgotten
wake is a silently stale frame. After this plan, the wake lives at the **mouth
of each channel through which change enters the engine**:

- **Channel 1 — time-based motion**: `fades.fadeTo()`, `tweens.start()`, and
  the structure-focus transition wake the scheduler themselves.
- **Channel 2 — asset arrival**: one generic "any slot reached `ready` ⇒ wake"
  subscription over the flat `allSlots` registry replaces eight per-slot wakes.
- **Channel 3 — selection**: `setSelected` / `setFocused` wake on actual change.
- **Channel 4 — camera**: **no change** (verdict below).

Explicit `requestRender()` calls survive ONLY on the approved-residue list
(Task 9), each with a didactic comment stating why it is an essential wake.

## Architecture

The principle: *the wake belongs to the channel through which change enters the
engine, not to each caller.* Subsystems that start observable change get a
`requestRender: () => void` injected at construction — the exact DI pattern
`biasCorrection` already uses (`engine.ts:605-609`:
`requestRender: () => state.subsystems.scheduler.requestRender()`; the closure
reads `state` lazily, so construction order inside the state literal is safe).

**Channel 2's single home** is a new `installSlotReadyWake` in
`src/services/engine/wiring/`, subscribing over `deps.allSlots` — the flat
registry `installLoadProgress` builds over EVERY slot (point + sidecar + DEV
synthetic). Why there and not inside `createAssetSlot`: the loading layer is
engine-agnostic (`AssetSlot` knows nothing about schedulers); the wiring layer
is where engine concerns attach to slots, and `allSlots` is the one complete
enumeration (it already feeds the loading bar + LoadingDevPanel — "if it shows
in the loading bar, it wakes the renderer"). `AssetSlot` dispatches
`'committed'` → `'ready'` AFTER the commit body completes
(`AssetSlot.ts:195-216`), so the generic ready-wake fires after GPU uploads —
it covers both the subscriber-located wakes AND the four wakes currently at the
tail of commit bodies. Subscribers notify in insertion order (a `Set`,
`AssetSlot.ts:114`), and construction-time subscribers attach before
`installLoadProgress` runs in `wireSlots`, so domain writes (e.g.
`setFamousMeta`) land before the generic wake fires. Loads only start in
`reevaluateDemand` (last step of `wireSlots`), so no slot can be `ready` before
the generic subscription attaches.

**Channel 4 verdict — no change.** The #286 one-camera-write site is
`runFrame.ts:151-153` and runs inside frames only — a sleeping loop never
reaches it, so it cannot source wakes. Camera change enters via the input
mouths (`wireInput.ts:233` onCameraChange, spaceMouse `onAxes` /
`onConnectionChange` at `engine.ts:578-580`) and the programmatic snap
(`cameraSnapshot.ts:95`); those wakes stay and get didactic comments in Task 9.

Source of truth for the why: the current shape braids "completing a domain
change" with the uniform policy "any observable change ⇒ wake", encoded as ~35
repetitions. The upcoming tour feature would multiply the obligation.

## Tech Stack

TypeScript (strict) + Vitest, all CPU-side — no WebGPU device, no WGSL, no
React in this plan's blast radius. Engine subsystem factories under
`src/services/{animation,engine}` with closure-based DI; tests mirror the src
tree under `tests/` and run with plain `vi.fn()` spies (no GPU fixtures
needed anywhere in this plan).

### Skymap conventions reminder (these override defaults)

- **`type` aliases, never `interface`.** No new `src/@types` files in this plan
  — the new `requestRender` deps are inline parameter types (not exported), and
  the one existing deps type that grows a field is
  `CreateSelectionSubsystemInput.d.ts`.
- **Didactic comments, timeless.** Module headers explain why and what the
  alternative was. No dates, PR refs, or "previously X" history — describe the
  current contract.
- **No `git add -A`/`.`** — stage specific paths. Branch + PR; squash-merge.
- **Re-verify every cited `file:line`** before editing — line numbers drift.
- **Behaviour-preserving + green throughout:** Tasks 1-3, 5-6, 8 ADD wakes
  while the old caller-side wakes still exist (double-wake is harmless — the
  scheduler coalesces). Removal tasks (4, 7, and parts of 8) come after their
  replacement wake landed. The suite must be green at every task boundary.
- **Test harness style:** plain-vitest factories with `vi.fn()` spies — match
  `tests/services/animation/fadeRegistry.test.ts` (subsystem contract tests)
  and `tests/services/engine/wiring/installLoadProgress.test.ts` (stub-slot +
  partial-`EngineState`-cast wiring tests).

### Verified current-tree facts (re-verify line numbers; they drift)

**Channel 1 mouths + construction sites:**

- `createFadeRegistry()` — `src/services/animation/fadeRegistry.ts:68`, no
  args today; `fadeTo` at `:89-100`. Constructed at `engine.ts:643`.
- `createTweenManager()` — `src/services/engine/camera/tweenManager.ts:52`, no
  args; `start` at `:67-69`. Constructed at `engine.ts:563`. Its docblock
  (`:30-35`) explicitly documents the OPPOSITE contract ("manager is
  intentionally *passive* … the engine still owns the scheduler wake-up after
  `start()`") — Task 2 rewrites it.
- `createStructureFocusSubsystem(initialNowMs?)` —
  `src/services/engine/subsystems/structureFocusSubsystem.ts:56`; the two fade
  transitions are `update()`'s `fade.fadeTo(1|0, …)` branches (`:94-101`).
  Constructed at `engine.ts:630`. Uses a private `createFadeController`, NOT
  the registry — so Task 1's registry wake does not cover it.
- DI precedent: `engine.ts:605-609` (biasCorrection's `requestRender` dep).

**Channel 1 removal sites (replacement wake in parentheses):**

- `tweenToGalaxy.ts:113-115` (tweens.start)
- `tweenToStructure.ts:47-49` (tweens.start)
- `cameraSnapshot.ts:137` — tweenToCameraSnapshot (tweens.start)
- `engine.ts:1337` — milkyWay.setEnabled (boringSetter wake via
  `settingsTable.ts:358` + unconditional fadeTo at `:1332`)
- `engine.ts:1351` — filaments.setEnabled (same shape, fadeTo at `:1346`)
- `engine.ts:1398` — flow.set (per-leaf boringSetters wake; an empty patch
  changes nothing, so no wake is needed on that path)
- `engine.ts:1008` — setVolumesEnabled (unconditional fadeTo at `:1003`)
- `engine.ts:219` — setSourceVisibleImpl's IMMEDIATE wake (fadeTo is called
  synchronously on every non-early-return path: `:226` visible, `:228` hidden;
  the only return before it is the no-change guard at `:213`)

**Channel 1 MUST-KEEP sites:**

- `engine.ts:241` — setSourceVisibleImpl's POST-FADE wake. It guards a
  `drawMask` write (`:235-239`) that happens in a microtask AFTER the final
  fade frame's `stillAnimating` evaluation (`fades.tick` at `runFrame.ts:478`
  resolves the fade promise; the awaiting continuation runs after the frame
  body). Removing it = stale final frame.
- `cameraSnapshot.ts:95` — snapToCameraSnapshot: instant programmatic camera
  write; no driver, fade, slot, or selection fires for it (Channel 4 verdict).

**Channel 2 (slot wakes — eight sites, two shapes):**

- Subscriber-located (`slot.subscribe` ready-branch): `famousMetaSlot.ts:33`
  (branch also does `setFamousMeta` — keep slimmer subscription),
  `structureCatalogSlot.ts:39` (ready branch becomes EMPTY; the error-warn
  branch keeps the subscription alive), `filamentSlot.ts:69` (branch also
  logs + `setLoaded` + `cb.filaments?.onReady` — keep slimmer),
  `galaxyCatalogSourceRegistry.ts:211` (branch also fires
  `cb.sources?.onCatalogReady` — keep slimmer).
- Commit-tail-located (inside the `commit` body, NOT the subscriber):
  `flowFieldSlot.ts:54`, `mcpmSlot.ts:51`, `cf4DensitySlot.ts:55`,
  `syntheticVolumeSlots.ts:101`. The generic ready-wake fires right after each
  commit completes, so these are covered. Behavioural delta (desired): a
  superseded-generation commit (AssetSlot's second race-check, `:214`) ran its
  side-effect but no longer wakes — the superseding generation's ready does.
- **Gap that must be fixed first:** `installLoadProgress.ts:39-46` hand-lists
  the sidecar slots and OMITS `state.assetSlots.flow` — the flow slot (built
  from the `ASSET_WIRING` `'flow'` row, `assetWiring.ts:171-176`, installed by
  `installSlots`) is missing from `allSlots` today (loading bar + dev panel
  too). Task 5 derives the enumeration from `ASSET_WIRING` so it can't drift
  again.
- `pgcAliasSlot.ts` has NO subscriber today; under the generic policy it gains
  a (redundant — palette-only data) wake on ready. Accepted: one coalesced
  frame versus a per-slot exemption list; uniformity wins.
- Wiring order in `wireSlots.ts`: `installSlots` `:79` → DEV synthetics `:85`
  → … → `installLoadProgress(state, deps)` `:109` → `reevaluateDemand` `:120`.

**Channel 3:**

- `selectionSubsystem.ts`: `setSelected` `:123-135`, `setFocused` `:146-154`,
  both dedupe via `selectionEq` before any effect. Deps type:
  `src/@types/engine/subsystems/CreateSelectionSubsystemInput.d.ts`.
  Constructed at `engine.ts:589-597`.
- Removal sites: `wireInput.ts:247-248` (click → setSelected then wake),
  `wireInput.ts:266` (dblclick empty-space → setFocused(null) then wake),
  `clearAll.ts:32` (unconditional wake; the function touches ONLY the two
  selection slots — verified, nothing non-selection mutated — so the wake is
  fully replaced by the setters' internal wakes; note its `:26-31` guard exists
  only to suppress that wake and the setters already dedupe, so the guard
  collapses too).
- `setHovered` (`:117-121`) must NOT wake — hover feeds only the React
  InfoCard; there is no hover halo in the scene (see the deliberate no-wake
  comment at `runFrame.ts:432-438`). Hover picks also only resolve during
  frames.
- KEEP: `wireInput.ts:233` (orbit onCameraChange — input mouth).

**Frame/loop residue (survivors, all already commented or to be commented in Task 9):**

- `startLoop.ts:158` — bootstrap kick.
- `runFrame.ts:164` — not-ready early-return re-poll; `runFrame.ts:485` —
  frame-tail `stillAnimating` (predicate at `:479-484`). The mid-frame demand
  seam is `reevaluateDemand` at `runFrame.ts:91` (not itself a wake).
- `runFrame.ts:402` — early return that SKIPS the tail when nothing is
  pickable. This is why Channel 1's structureFocus self-wake matters: a focus
  fade started in a frame that then early-returns would otherwise strand.
- `settingsTable.ts:358` (in `src/services/engine/wiring/settingsTable.ts`,
  `buildSettersFromTable`) — the uniform settings-write wake; stays.
- `engine.ts:578` + `:580` — spaceMouse `onConnectionChange` / `onAxes` mouths.

**Sweep-rule candidates (not in the explicit removal list — Task 9 decides):**

- `engine.ts:300` (setCategoryLabelVisible — fadeTo is CONDITIONAL on the
  category routing branches `:275-292`) and `engine.ts:324`
  (setCategoryMarkerVisible — fadeTo unconditional at `:312`).
- Any wake in `addVolumeField` / `setVolumeFieldEnabled` and other handle
  setters the census turns up.

---

## Task 1: `fadeRegistry.fadeTo` wakes the scheduler

**Files:**
- Modify `src/services/animation/fadeRegistry.ts`
- Modify `tests/services/animation/fadeRegistry.test.ts`
- Modify `src/services/engine/engine.ts` (`:643` construction)

**Signature:**

```ts
export function createFadeRegistry(deps: {
  readonly requestRender: () => void;
}): FadeRegistry;
```

**Behaviour:** `fadeTo` calls `deps.requestRender()` unconditionally on every
invocation (after starting the controller fade). No other method wakes —
`register` / `setImmediate` / `opacityOf` / `tick` / `unregister` are
construction-seeding or frame-internal paths whose callers wake through other
channels (settings writes via `settingsTable`, draws inside frames). The deps
param is REQUIRED, not optional — a new construction site that forgets the wake
source must be a compile error, not a silently sleeping fade.

- [x] Add the test `fadeTo wakes the scheduler` — build with
  `createFadeRegistry({ requestRender: spy })`, `register` a handle, call
  `fadeTo(h, 1, 600, 0)`, assert `spy` called exactly once.
- [x] Add the test `register, setImmediate, tick and opacityOf do not wake` —
  drive each, assert the spy was never called.
- [x] Run `npm test -- fadeRegistry` → the two new tests fail (factory takes no
  deps yet); existing tests also fail to compile once the signature changes —
  expected.
- [x] Implement: add the deps param; wake inside `fadeTo`. Extend the module
  header with the new contract: *starting a fade ensures frames render —
  callers never wake the scheduler* — and why `setImmediate` does not wake
  (its callers are settings paths that wake via the settings table, and
  construction-time seeding precedes the first frame).
- [x] Update every `createFadeRegistry(` construction site: grep `src/` +
  `tests/` — production is `engine.ts:643`
  (`createFadeRegistry({ requestRender: () => state.subsystems.scheduler.requestRender() })`,
  matching the biasCorrection DI shape at `engine.ts:605-609`); tests pass a
  `vi.fn()` or `() => {}` (a tiny local `makeRegistry()` helper in the test
  file keeps the churn to one line).
- [x] Main thread: `npm test`; `npm run typecheck`.
- [x] Commit `feat(engine): fadeRegistry wakes the scheduler on fadeTo` —
  stage `src/services/animation/fadeRegistry.ts`,
  `tests/services/animation/fadeRegistry.test.ts`,
  `src/services/engine/engine.ts`, plus any other construction-site files the
  grep found.

---

## Task 2: `tweenManager.start` wakes the scheduler

**Files:**
- Modify `src/services/engine/camera/tweenManager.ts`
- Modify its test file (locate via grep `createTweenManager(` under `tests/`)
- Modify `src/services/engine/engine.ts` (`:563` construction)

**Signature:**

```ts
export function createTweenManager(deps: {
  readonly requestRender: () => void;
}): TweenManager;
```

**Behaviour:** `start()` wakes after storing the tween. `cancel()` and
`advance()` do NOT wake: every cancel site is already awake (pointerdown is an
input mouth; the SpaceMouse cancel fires inside `applyToCamera` during a
frame), and `advance` runs inside frames by definition.

- [x] Add the test `start wakes the scheduler` — spy deps, `start(fakeTween)`,
  assert one call.
- [x] Add the test `cancel and advance do not wake` — after `start`, clear the
  spy, call `cancel()` and `advance(camStub, 0)`, assert zero calls.
- [x] Run the tween-manager suite → fails.
- [x] Implement the wake in `start`. **Rewrite the module-header paragraph at
  `tweenManager.ts:30-35`** — it documents the opposite contract ("manager is
  intentionally passive … engine owns the wake"). New contract text to carry:
  *starting a tween ensures frames render — `start()` wakes the scheduler
  itself, so the three focus helpers and any future tour driver never follow
  up with a wake; `cancel`/`advance` stay wake-free because their call sites
  are frames or input mouths that are awake already.* Keep it timeless (no
  "previously" framing).
- [x] Update construction sites: `engine.ts:563` →
  `createTweenManager({ requestRender: () => state.subsystems.scheduler.requestRender() })`;
  test fixtures get a spy/noop.
- [x] Main thread: `npm test`; `npm run typecheck`.
- [x] Commit `feat(engine): tween manager wakes the scheduler on start` —
  stage the three touched paths (+ any extra construction sites found).

---

## Task 3: structureFocus wakes on focus transition

**Files:**
- Modify `src/services/engine/subsystems/structureFocusSubsystem.ts`
- Modify its test file (locate via grep `createStructureFocusSubsystem(` under
  `tests/`)
- Modify `src/services/engine/engine.ts` (`:630` construction)

**Signature:**

```ts
export function createStructureFocusSubsystem(
  deps: { readonly requestRender: () => void },
  initialNowMs?: number,
): StructureFocusSubsystem;
```

**Behaviour:** `update()` calls `deps.requestRender()` exactly when a focus
transition starts a fade (both branches at `:94-101` — fade-in toward a new
id, fade-out toward null). Steady frames (the `targetId === focusedId` early
return at `:91`) never wake. Why the self-wake even though `update` runs
inside frames: `runFrame` can early-return at `:402` (nothing pickable) and
skip the `stillAnimating` tail — a fade started in that frame would otherwise
strand mid-ramp until some unrelated event woke the loop.

- [x] Add the test `update wakes the scheduler on focus transition` — fake
  `StructureRecord` (cluster), `update(rec, 0)`, assert one wake; then
  `update(null, 100)` (fade-out transition), assert a second.
- [x] Add the test `steady focused frames do not re-wake` — `update(rec, 0)`,
  clear spy, `update(rec, 16)` × a few frames, assert zero calls.
- [x] Run the suite → fails (signature).
- [x] Implement; extend the module header: the subsystem's fade controller is
  private (not in the FadeRegistry), so the registry's fadeTo wake cannot cover
  it — the transition is this channel's mouth.
- [x] Update constructions: `engine.ts:630` →
  `createStructureFocusSubsystem({ requestRender: () => state.subsystems.scheduler.requestRender() })`;
  test fixtures pass a spy (keep `initialNowMs` second where used).
- [x] Main thread: `npm test`; `npm run typecheck`.
- [x] Commit `feat(engine): structureFocus wakes on focus transition` — stage
  the touched paths.

---

## Task 4: Channel 1 removals + the two MUST-KEEP comments

**Files:**
- Modify `src/services/engine/camera/tweenToGalaxy.ts`,
  `tweenToStructure.ts`, `cameraSnapshot.ts`
- Modify `src/services/engine/engine.ts`
- Modify the setSourceVisible test file (locate via grep
  `setSourceVisibleForTest` under `tests/`)

Every removal below has its replacement wake landed (Tasks 1-2). Re-verify
each line before editing.

- [ ] **Contract test first (the MUST-KEEP guarantee):** in the
  setSourceVisible test file, add
  `setSourceVisible wakes after the fade completes (final drawMask write lands on a rendered frame)`
  — fades stub with `fadeTo: vi.fn().mockResolvedValue(undefined)` and
  `opacityOf: () => 0`; `await setSourceVisibleImpl(state, { cb }, src, false)`;
  assert the scheduler spy's LAST call came after the `fadeTo` call (compare
  `mock.invocationCallOrder`) and the drawMask bit is cleared. This pins
  `engine.ts:241` so a future "cleanup" can't silently drop it. Run it — it
  should pass against the current tree (it encodes current behaviour).
- [ ] Remove the redundant wakes (and their now-stale "wake the render loop"
  comments): `tweenToGalaxy.ts:113-115`, `tweenToStructure.ts:47-49`,
  `cameraSnapshot.ts:137` (also fix the module-header mention of "the trailing
  `requestRender`" at `:21-22` — `tweens.start` now owns the wake),
  `engine.ts:1337`, `engine.ts:1351`, `engine.ts:1398`, `engine.ts:1008`,
  `engine.ts:219`.
- [ ] Add the didactic KEEP comment at `engine.ts:241`: *essential wake — the
  final `drawMask` write happens in a microtask after the last fade frame's
  `stillAnimating` evaluation (the fade promise resolves from `fades.tick`
  inside the frame body), so no channel wake covers it; without this the final
  frame renders with the stale mask.*
- [ ] Add the didactic KEEP comment at `cameraSnapshot.ts:95`: *essential wake
  — an instant programmatic camera write; camera drivers only run inside
  frames, and no fade/tween/slot/selection fires here, so the snap is its own
  channel mouth.*
- [ ] Grep `tests/` for assertions that the removed sites woke the scheduler
  (e.g. milkyWay/filaments/volumes setter tests asserting `requestRender`);
  update them to assert the new truth (wake arrives via fadeTo / boringSetter,
  or simply drop the direct-call assertion).
- [ ] Main thread: `npm test`; `npm run typecheck`.
- [ ] Commit
  `refactor(engine): channel-1 owners wake the scheduler; drop caller-side wakes`
  — stage the five src files + touched test files.

---

## Task 5: derive the `allSlots` sidecar enumeration from `ASSET_WIRING`

**Files:**
- Modify `src/services/engine/wiring/installLoadProgress.ts`
- Modify `tests/services/engine/wiring/installLoadProgress.test.ts`

**Why before the generic wake:** the hand-maintained sidecar array at
`installLoadProgress.ts:39-46` omits `state.assetSlots.flow`, so the flow slot
is invisible to the loading bar / dev panel today — and would be invisible to
Channel 2's generic wake. The list is a duplicate of `ASSET_WIRING`'s
non-point keys; derive it so the two can't drift (a future slot added to the
wiring table lands in `allSlots` for free).

**Behaviour:** replace the literal array with an iteration over `ASSET_WIRING`
rows whose `key` is a string (point rows have numeric keys and are already
handled by the `state.assetSlots.points` loop above), reading
`state.assetSlots[row.key]` and skipping null (lazy slots still register —
unchanged). The DEV-synthetic block stays as-is (those are deliberately not
wiring rows; see `assetWiring.ts:40-43`).

- [ ] Extend the existing test fixture's `assetSlots` with
  `flow: stubSlot('flow')` and add the assertion `names.has('flow')` to
  `populates allSlots from point + sidecar + synthetic slots by name` (or add a
  sibling test `includes every ASSET_WIRING sidecar — flow included`). Run →
  fails.
- [ ] Implement the derivation; update the module header (the "Why one shared
  Map" section gains: the enumeration comes from `ASSET_WIRING` so the registry
  and the wiring table cannot disagree about what exists).
- [ ] Main thread: `npm test -- installLoadProgress`; full `npm test`;
  `npm run typecheck`.
- [ ] Commit
  `fix(engine): derive allSlots sidecars from ASSET_WIRING (restores missing flow slot)`
  — stage the two paths.

---

## Task 6: generic slot-ready wake (`installSlotReadyWake`)

**Files:**
- Create `src/services/engine/wiring/installSlotReadyWake.ts`
- Create `tests/services/engine/wiring/installSlotReadyWake.test.ts`
- Modify `src/services/engine/phases/wireSlots.ts` (call site + docblock list)

**Signature:**

```ts
export function installSlotReadyWake(
  state: EngineState,
  allSlots: ReadonlyMap<string, AssetSlot<unknown, unknown>>,
): void;
```

**Behaviour:** for every slot in the map, `slot.subscribe((s) => { if (s.kind
=== 'ready') state.subsystems.scheduler.requestRender(); })`. Called from
`wireSlots` immediately after `installLoadProgress(state, deps)`
(`wireSlots.ts:109`) with `deps.allSlots`, and before `reevaluateDemand`
(`:120`) — loads start only there, so no ready can precede the subscription.

**Module-header didactic content (required):** the channel-mouth principle
(asset arrival is ONE channel; one subscription replaces a per-slot
obligation); why the home is the wiring layer over `allSlots` rather than
inside `createAssetSlot` (loading layer stays engine-agnostic; `allSlots` is
the one complete enumeration shared with the loading bar); why ready-after-
commit makes this sufficient even for slots whose old wake sat at the commit
tail; and a note that `slot.cancel()`'s rollback can re-notify a `ready` state
— the extra coalesced wake is harmless.

- [ ] Write the tests (stub-slot style of `installLoadProgress.test.ts` —
  stub `subscribe` to capture the callback):
  - `wakes the scheduler when any slot transitions to ready` — two stub slots;
    fire one captured callback with `{ kind: 'ready', value: {} }`; assert one
    `requestRender` call; fire the other; assert two.
  - `does not wake on non-ready transitions` — fire callbacks with
    `{ kind: 'loading' }` and `{ kind: 'error', error: new Error('x') }`;
    assert zero calls.
  - `subscribes every slot in the registry` — assert each stub's `subscribe`
    was called exactly once.
- [ ] Run → fails (module absent).
- [ ] Implement the module; wire the call into `wireSlots.ts` after
  `installLoadProgress` and extend the phase docblock's numbered list (and its
  stale "State writes" sidecar enumeration, which also predates the flow slot).
- [ ] Main thread: `npm test -- installSlotReadyWake`; full `npm test`;
  `npm run typecheck`.
- [ ] Commit `feat(engine): one generic slot-ready render wake over allSlots`
  — stage the three paths.

---

## Task 7: per-slot wake removals

**Files:**
- Modify `src/services/loading/slots/famousMetaSlot.ts`,
  `structureCatalogSlot.ts`, `filamentSlot.ts`, `flowFieldSlot.ts`,
  `mcpmSlot.ts`, `cf4DensitySlot.ts`, `syntheticVolumeSlots.ts`
- Modify `src/services/engine/wiring/galaxyCatalogSourceRegistry.ts`
- Touched slot test files (grep `requestRender` under `tests/services/loading/`
  and `tests/services/engine/wiring/`)

The generic wake (Task 6) now covers all eight. Two removal shapes:

- [ ] **Subscriber-located** — delete only the `requestRender` line, keep the
  slimmer subscription:
  - `famousMetaSlot.ts:33` (ready branch keeps `setFamousMeta`; error branch
    untouched);
  - `filamentSlot.ts:69` (ready branch keeps the counts log, `setLoaded`,
    `cb.filaments?.onReady`);
  - `galaxyCatalogSourceRegistry.ts:211` (ready branch keeps
    `cb.sources?.onCatalogReady`);
  - `structureCatalogSlot.ts:39` — the ready branch becomes EMPTY: delete the
    whole `if (s.kind === 'ready')` block, keep the subscription for the
    error-warn branch, and rewrite the docblock paragraph that says "this
    subscriber's only job is to wake the renderer" (now: only warns on
    failure; the render wake is the wiring layer's generic slot-ready
    subscription).
- [ ] **Commit-tail-located** — delete the trailing
  `state.subsystems.scheduler.requestRender();` from each commit body:
  `flowFieldSlot.ts:54`, `mcpmSlot.ts:51`, `cf4DensitySlot.ts:55`,
  `syntheticVolumeSlots.ts:101`. Where a docblock mentions "then the render
  loop wakes" (e.g. `flowFieldSlot.ts:15-17`), repoint it at the generic
  ready-wake.
- [ ] Update each touched module header so no comment still claims the slot
  wakes the renderer itself; one line each pointing at `installSlotReadyWake`.
- [ ] Update any slot tests asserting the direct wake (assert the domain
  effects only; the wake is covered by `installSlotReadyWake.test.ts`).
- [ ] Main thread: full `npm test`; `npm run typecheck`.
- [ ] Commit `refactor(loading): drop per-slot render wakes (generic ready wake owns them)`
  — stage the eight src files + touched tests.

---

## Task 8: selection wakes itself

**Files:**
- Modify `src/@types/engine/subsystems/CreateSelectionSubsystemInput.d.ts`
- Modify `src/services/engine/subsystems/selectionSubsystem.ts`
- Modify `src/services/engine/engine.ts` (`:589-597` construction)
- Modify `src/services/engine/phases/wireInput.ts`
- Modify `src/services/engine/helpers/clearAll.ts`
- Modify the selection-subsystem test file + the clearAll test file (grep)

**Contract — deps-type addition** (existing type file; no new `@types` file):

```ts
/**
 * Wake the render loop one frame. setSelected/setFocused call this after an
 * actual change so the halo / focus fade update without callers having to
 * remember a follow-up wake. setHovered deliberately does NOT — hover feeds
 * only the React InfoCard (no scene-side halo), and hover picks resolve
 * inside frames anyway.
 */
requestRender: () => void;
```

**Behaviour:** `setSelected` and `setFocused` call `requestRender()` after the
state write + callback fan-out, ONLY when the dedupe guard passed (a no-op set
stays wake-free — that preserves clearAll-on-empty-scene as a true idle no-op).
`setHovered` unchanged.

- [ ] Add contract tests (selection test file, spy deps):
  - `setSelected wakes the scheduler on actual change` — one call.
  - `setSelected does not wake when the selection is unchanged` — set the same
    selection twice; one call total.
  - `setFocused wakes on change and not on no-op` — same shape.
  - `setHovered never wakes` — zero calls.
- [ ] Run → fails (deps field absent).
- [ ] Implement: add the field, the two wakes, and a short module-header
  addition (selection is a change channel; its mouth owns the wake — the
  click/dblclick handlers and `clearAll` no longer follow up).
- [ ] Update constructions: `engine.ts:589-597` gains
  `requestRender: () => state.subsystems.scheduler.requestRender()`; test
  fixtures gain a spy/noop.
- [ ] Remove the now-redundant wakes: `wireInput.ts:247-248` (and its
  "Selection changed — render…" comment) and `wireInput.ts:266`. The orbit
  `onCameraChange` wake at `wireInput.ts:233` STAYS untouched.
- [ ] Rewrite `clearAll.ts`: drop the `scheduler.requestRender()` at `:32` and
  the `if (… !== null)` guard at `:28-31` (it existed only to suppress that
  wake; the setters dedupe internally, and they now also own the wake — so an
  Esc on an empty scene is still wake-free, now by the setters' guard). Body
  becomes the two setter calls; update the docblock (`:26-27` comment included)
  to name the new wake owner.
- [ ] Update clearAll/wireInput tests asserting the old direct wakes.
- [ ] Main thread: full `npm test`; `npm run typecheck`.
- [ ] Commit `feat(engine): selection subsystem owns its render wake` — stage
  the six src paths + touched tests.

---

## Task 9: residue sweep + didactic comments

**Files:** review across `src/`; small edits where listed.

- [ ] Grep `requestRender` across `src/` (definitions in
  `renderScheduler.ts` / type files excluded). Produce the survivor census in
  the task notes.
- [ ] Assert every survivor is on the **approved-residue list**:
  1. `startLoop.ts:158` — bootstrap kick;
  2. `runFrame.ts:164` (not-ready re-poll) + `runFrame.ts:485`
     (stillAnimating tail);
  3. `wireInput.ts:233` — orbit input mouth;
  4. `engine.ts:578` + `:580` — spaceMouse `onConnectionChange` / `onAxes`
     mouths;
  5. `settingsTable.ts:358` — the uniform settings-write wake
     (`buildSettersFromTable`);
  6. `engine.ts:241` — setSourceVisibleImpl post-fade wake (commented in
     Task 4);
  7. `cameraSnapshot.ts:95` — programmatic snap (commented in Task 4);
  8. `installSlotReadyWake.ts` — the Channel 2 mouth;
  9. the channel-internal wakes added by Tasks 1-3 and 8 (fadeRegistry,
     tweenManager, structureFocus, selection) + the pre-existing
     biasCorrection injected dep (`engine.ts:608` construction; the subsystem's
     own internal call sites).
- [ ] Every survivor that lacks one gets a one-to-three-line didactic comment
  stating why it is an *essential* wake (which channel it is the mouth of, or
  why no channel covers it). The input mouths (`wireInput.ts:233`,
  `engine.ts:578-580`) and the loop sites are mostly commented already —
  verify the existing comments still tell the truth under the new model and
  sharpen where they don't (e.g. `runFrame.ts:447`'s "event handlers and
  engine handle setters call scheduler.requestRender()" now reads "channel
  mouths — input, fades/tweens, slot arrivals, selection — wake it").
- [ ] **Decision rule for unlisted survivors** (apply, don't punt): if every
  mutating path through the function provably triggers a channel wake
  (an unconditional `fadeTo`, a boringSetter, a slot ready, a selection set),
  REMOVE the trailing wake; otherwise KEEP it with a justification comment.
  Known candidates:
  - `engine.ts:324` (setCategoryMarkerVisible) — fadeTo at `:312` is
    unconditional → expect REMOVE;
  - `engine.ts:300` (setCategoryLabelVisible) — fadeTo is conditional on the
    `LABEL_LAYER_BY_CATEGORY` routing (`:275-292`); verify every
    `LabelCategory` reaches one of the two fadeTo branches; remove only if
    exhaustive, else keep + comment;
  - any wake in `addVolumeField` / `setVolumeFieldEnabled` / `setTier` /
    `destroy` paths the census surfaces — same rule.
- [ ] Update any tests invalidated by rule-driven removals.
- [ ] Main thread: full `npm test`; `npm run typecheck`.
- [ ] Commit `docs(engine): annotate essential render-wake sites; sweep stragglers`
  — stage exactly the touched files.

---

## Task 10: entanglement-radar review over the full diff

**Files:** review only; small edits if found.

- [ ] Run the `entanglement-radar` skill over the full branch diff. Confirm
  the un-braid landed: "domain change" and "wake policy" are no longer
  complected at call sites; the wake policy has exactly one home per channel;
  no new mirror state (the drivers/allSlots registries were reused, not
  duplicated); the slot enumeration has one source (`ASSET_WIRING`).
- [ ] Confirm the two MUST-KEEP sites (`engine.ts:241`, `cameraSnapshot.ts:95`)
  survived with their comments, and the Task 4 post-fade contract test exists
  and passes.
- [ ] Confirm Channel 4 is untouched: no edits to `runCameraDrivers`,
  `cameraDrivers.ts`, or the `runFrame` camera block beyond comments.
- [ ] Grep `requestRender` one final time; the census must match Task 9's
  approved list exactly.
- [ ] Main thread: full `npm test`; `npm run typecheck`.
- [ ] Commit any cleanup (specific paths only); otherwise no-op.

---

## Self-review notes

- **Green ordering.** Add-wake tasks precede remove-wake tasks per channel;
  double-wakes in the interim are coalesced by the scheduler (token guard,
  `renderScheduler.ts:77-79`). The suite is green at every boundary.
- **The two MUST-KEEPs are protected by artifacts**, not silence: a contract
  test (Task 4, post-fade wake order) and didactic comments on both sites,
  plus a Task 10 verification step.
- **Channel 2 home rationale** is recorded in `installSlotReadyWake`'s module
  header and this plan's Architecture section: `allSlots` is the single
  complete slot enumeration; `AssetSlot` stays engine-agnostic; ready fires
  after commit so GPU uploads are covered.
- **Behavioural deltas accepted intentionally:** superseded-generation commits
  no longer wake (the superseding ready does); `pgcAlias` gains a redundant
  ready wake (uniformity over an exemption list); the flow slot appears in the
  loading bar / dev panel for the first time (Task 5's bug fix).
- **Required (not optional) `requestRender` deps** on all three Channel 1
  factories + the selection input: a forgotten wake source becomes a compile
  error. Test churn is mechanical (one spy per fixture).
- **Tour readiness.** A future tour driver starts tweens/fades through the
  same mouths and inherits the wakes for free — no new obligation surface.
- **Line numbers drift.** Every `file:line` here was verified against the tree
  on 2026-06-10; re-verify before each edit.
