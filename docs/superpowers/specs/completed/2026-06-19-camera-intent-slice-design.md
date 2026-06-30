# Camera intent into the store; pose derived in the frame (design)

> **Status:** approved design, awaiting implementation plan. **Builds on** the
> landed reconcile-sagas seam (PR #352, `a1af66d6`) — `setSagaContext` /
> `ReconcileEffects` / `getContext('reconcile')` / `watchWake` are on `main`.
> **Grilled** 2026-06-19 (decisions folded below; transcript in
> `docs/grill-sessions/camera-intent-slice-2026-06-19.md`).
> **Why this exists:** the camera is a mutable `OrbitCamera` struct
> (`state.cam`) written every frame by three producers — drag input, an in-flight
> tween, and auto-rotate — and its "a change needs a frame" wake is hand-paired at
> each `orbitControls` mutation site via an `onCameraChange` callback
> (`orbitControls.ts:247,336,413,446,483`). That is a mutable place reachable by
> several writers with a scattered, easy-to-forget wake — the value/place +
> single-source-of-truth knot [`intent.md`](../../superpowers/conventions/intent.md)
> and [`simplicity.md`](../../superpowers/conventions/simplicity.md) §5/§8 exist to
> remove. This folds the camera's **Intent** into the store (alongside settings,
> selection, tier, ui) and keeps the **per-frame interpolated pose derived** by the
> camera-driver table — never stored, never mirrored.

## The decision in one line

The store holds camera **intent** — the drag-accumulated **base pose**, the active
**tween descriptor**, **auto-rotate** params, and a `dragging` flag — never the
per-frame interpolated pose. The pose is produced each frame by the existing
**`CameraDriver` table** (now returning a pose instead of mutating `cam`): a
**drag driver** reads the transient gesture register `state.cam`; **tween** and
**auto-rotate** drivers produce their pose from a store descriptor + an
engine-owned clock. Every non-resting driver **commits its last pose into `base` on
its deactivation edge** — one dispatch, never per frame. The engine reads the
result through `runCameraDrivers`, where it reads `state.cam` today.

### Why store the intent, not the pose

The naive "put the pose in the store and pull it" fails on two skymap specifics
that single-producer camera systems don't have:

1. **The pose is an integrator with three full-rate producers.** `yaw += dyaw`
   needs the previous yaw — a drag is a fold over time. And the pose is written
   every frame by the **tween** and **auto-rotate** as well as drag. For the store
   to be the pose's authoritative home, *all three* must write it — including the
   tween's per-frame interpolation step. Dispatching that 60×/s is the
   action-log-as-sample-buffer smell `intent.md` forbids.

2. **Store the *descriptor*, derive the pose.** A tween's pose is
   `evaluate(descriptor, elapsed)` — a pure function of a store descriptor + frame
   time. So the **descriptor is dispatched once** and the frame evaluates it with
   zero further dispatches. The same removes the auto-rotate tick (store `{rate}`,
   derive the spin from elapsed). And a **drag** integrates in the engine's
   transient register and commits **one** pose on `pointerup`. The only thing never
   in the store is the per-frame interpolated value — produced by the driver table,
   read by the renderers.

What remains in the store is genuine, serializable Intent. The descriptor's payoff
is **in-session**: derivation without a tick storm, and a uniform commit-on-edge
handoff. It is *not* a deep-link-of-motion mechanism — a deep-link is `#focus=<ref>`
(a focus target ref, `focusUrl.ts`), gated on catalog-ready, that **produces an
arrival tween home→target on load**; it never serializes the live pose or a
descriptor. Motion *recording* is a separate tour feature with its own
relative-time beat list. The live tween descriptor is **session-local** — its clock
is an engine Resource (§2), so the store carries no wall-clock at all.

## Scope

**In scope:**

- A new `camera` root slice (route `cameraRoute`) holding **base pose**
  (`{ target, yaw, pitch, distance }`), a **timeless tween descriptor**
  (`{ from, to, duration, easing } | null`), **auto-rotate** (`{ active, rate }`),
  and a **`dragging`** flag.
- `orbitControls` reworked: it keeps its orbit/pan/zoom math but mutates the
  transient gesture register `state.cam`, and flips `dragging` on the gesture
  edges (`beginDrag` / `endDrag`). The `onCameraChange` pairing is replaced by a
  single `onChange → requestRender` wake.
- The `CameraDriver` table reworked to **return a pose**: `orbitDrag` (80),
  `tween` (60), `autoRotate` (20), `resting` (0). `runCameraDrivers` returns the
  highest-priority active driver's pose.
- Engine-owned animation clock(s) (Resource): elapsed since a descriptor's
  identity changed, fed to the tween / auto-rotate drivers.
- The uniform **commit-on-edge**: when the active driver changes away from a
  non-resting one, the engine dispatches `commitCameraPose(lastPose)` once.
- Generalize the landed `watchWake` predicate from `settings/`-only to a
  `WAKE_ROUTES` set covering `camera`.

**Out of scope (do not scope-creep):**

- **The selection / attention ladder** (hover → select → focus) —
  [selection-into-intent-store](./2026-06-18-selection-into-intent-store-design.md).
  `focusOn` *selects* (selection slice) and *commands a tween* (this slice); they
  compose but ship separately.
- **The tween easing math.** `advanceCameraTween` / `cameraTween.ts` is reused as
  the pure `evaluate(descriptor, elapsed)` body — no animation-curve change.
- **The tour driver** (priority 100, unbuilt — see `cameraDrivers.ts:103`). A new
  top-priority row later; this spec lands the three existing producers + `resting`.
- **GPU / matrix code.** `computeViewProj`, per-renderer uniform writes, HDR passes
  are unchanged — they read the produced pose where they read `state.cam` today.
- **Any motion-feel change.** Sensitivities, easing, clamps, and the auto-rotate
  rate move verbatim.

---

## 1. The model

Camera Intent lives in the store; the per-frame pose is **produced by the driver
table** from that Intent plus engine Resources (the gesture register, the clock):

| In the store (`camera` slice — Intent, serializable) | Engine Resource (transient) | Produced each frame (never stored) |
| --- | --- | --- |
| `base { target, yaw, pitch, distance }` — committed resting pose | `state.cam` — the **drag gesture register** | the active pose |
| `tween { from, to, duration, easing } | null` — timeless | `tweenStartMs` / `autoRotateStartMs` — the clock | view-proj, `position` |
| `autoRotate { active, rate }` — timeless | `lastPose` / `prevActiveId` — for commit-on-edge | |
| `dragging: boolean` | | |

```
pointermove ─▶ orbitControls.onMove ─▶ mutate state.cam (gesture register) + requestRender
focusOn / fly-to ─▶ engine fills from=lastPose ─▶ dispatch startCameraTween(descriptor)
toggle auto-rotate ─▶ dispatch setAutoRotate({active,rate})
                                                    │ (store notifies)
                  watchWake (WAKE_ROUTES) ─▶ requestRender  (wake at the mouth)
                                                    ▼
engine frame ─▶ runCameraDrivers(drivers, getState(), state.cam, elapsed) ─▶ pose ─▶ computeViewProj
                                                    │
        active driver changed off a non-resting one ─▶ dispatch commitCameraPose(lastPose)   (once)
```

### The driver table (data; priority-ordered)

Each driver **produces** a pose; priority replaces statement order, as today
(`cameraDrivers.ts`). No blending — exactly one driver yields the pose:

```ts
type CameraDriver = {
  id: string;
  priority: number;
  isActive: (s: RootState) => boolean;
  pose: (s: RootState, cam: OrbitCamera, elapsed: number) => OrbitCamera;
};

const drivers: CameraDriver[] = [
  { id: 'orbitDrag',  priority: 80, isActive: (s) => s.camera.dragging,
    pose: (_s, cam) => cam },                                   // the gesture register
  { id: 'tween',      priority: 60, isActive: (s) => s.camera.tween !== null,
    pose: (s, _c, e) => evaluate(s.camera.tween!, e) },         // from/to/duration — no base, no store time
  { id: 'autoRotate', priority: 20, isActive: (s) => s.camera.autoRotate.active,
    pose: (s, _c, e) => spin(s.camera.base, s.camera.autoRotate.rate, e) },
  { id: 'resting',    priority: 0,  isActive: () => true,
    pose: (s) => s.camera.base },                               // committed resting pose
];

export function runCameraDrivers(drivers, s, cam, elapsed): OrbitCamera {
  let winner = drivers[0];
  for (const d of drivers) if (d.isActive(s) && d.priority > winner.priority) winner = d;
  return winner.pose(s, cam, elapsed);                          // returns, not mutates
}
```

`tween.pose` is `evaluate(descriptor, elapsed)` — `from`/`to` are absolute poses,
so it needs neither `base` nor any stored time. `autoRotate.pose` spins `base` by
`elapsed * rate`. `resting` is the floor.

### One lifecycle for every driver: produce → commit-on-edge

Drag, tween, and auto-rotate share a single lifecycle, which is the heart of "no
per-frame dispatch":

- **Enter.** `orbitDrag`: `orbitControls.onGestureStart` seeds `state.cam` from
  `base` and dispatches `beginDrag` (`dragging = true`). `tween` / `autoRotate`:
  the dispatch that installs the descriptor; the engine zeroes that driver's clock
  when the descriptor's identity changes.
- **Run.** The winning driver's `pose(...)` is produced each frame. Zero
  dispatches. `base` is untouched and irrelevant while a non-resting driver owns
  the pose.
- **Exit (commit-on-edge).** When the active driver changes away from a non-resting
  one — drag released, tween elapsed ≥ duration, auto-rotate toggled off — the
  engine dispatches **one** `commitCameraPose(lastPose)`, folding the last produced
  pose into `base`. The next drag seeds from there; no jump.

> **Why the engine commits, not a reducer.** The committed pose is the last
> *produced* pose, which depends on `elapsed` / the gesture register — frame
> knowledge, and `Date.now()` in a reducer is impure (and banned here). The engine,
> which produced that pose this frame, projects it into the store on the edge. This
> is `intent.md`'s descriptor pattern (the resource layer's commit path dispatches
> a fact): one dispatch per transition, not per frame.

A grab mid-animation is the same edge: `pointerdown` → `beginDrag` makes
`orbitDrag` win (priority 80); the displaced tween/auto-rotate driver commits its
last pose on the same frame and `orbitControls` mutates `state.cam` from there.
`cameraSnapshot.ts` (today's pose-capture helper) becomes the `commitCameraPose`
payload builder.

---

## 2. The camera slice (Intent)

```ts
// src/state/camera/cameraSlice.ts  (inline-Immer, like settingsSlice)
type CameraState = {
  base: { target: Vec3; yaw: number; pitch: number; distance: number };
  tween: CameraTweenDescriptor | null;      // { from, to, duration, easing } — timeless
  autoRotate: { active: boolean; rate: number };
  dragging: boolean;
};

reducers: {
  beginDrag (s) { s.dragging = true; },
  endDrag   (s) { s.dragging = false; },
  commitCameraPose (s, { payload }) { s.base = payload; },   // engine, on a deactivation edge
  startCameraTween  (s, { payload }) { s.tween = payload; }, // from filled by the engine (= lastPose)
  cancelCameraTween (s)              { s.tween = null; },
  setAutoRotate     (s, { payload }) { s.autoRotate = payload; },
}
```

No wall-clock in the store: the descriptors are **timeless**, and `elapsed` is an
engine Resource (the clock), reset when a descriptor's identity changes. This keeps
Intent serializable and means the dispatcher never needs `nowMs`.

**Clamps split by kind, deliberately.** Pitch (pole saturation) and distance clamps
apply where `state.cam` is mutated (`orbitControls`) and on `commitCameraPose`'s
payload build — they are constraints on the *state value* (a saturating integrator:
orbit past the pole and the accumulator must hold). This is **not** the display-clamp
case the reconcile-sagas spec moves to the read edge (`clampVolumeContrast` clamps an
*output mapping*). The distinction is essential: a state-saturating clamp belongs
with the integrator; an output clamp belongs at the consumption edge. (Radar note:
keep the two clamp kinds named distinctly so neither migrates to the other's home.)

**`autoRotate` relocates, it isn't greenfield.** PR #352 dissolved
`camera.setAutoRotate` into a direct `settings/` write — it currently lives at
`settings.camera.autoRotate` (`settingsSlice.ts:91`). This spec **moves** it into the
new `camera` slice as `{ active, rate }`; the `settings/setAutoRotate` action and the
now-empty `settings.camera` sub-object are removed, and the SettingsPanel toggle
dispatches the camera-slice action.

`base` is genuine Intent: "where the user came to rest," serializable. In
single-producer camera systems this base *is* the whole pose — which is why storing
it has always worked; skymap only adds the descriptors and the drag register on top.

---

## 3. How drag reaches the driver (no manipulator, no throttle)

Drag does not dispatch deltas. `orbitControls` keeps its exact math, mutating the
transient gesture register `state.cam`, and flips `dragging` on the gesture edges:

```ts
attachOrbitControls(canvas, state.cam, {
  onGestureStart: () => {
    seedFromBase(state.cam, store.getState().camera.base);   // start from the committed pose
    store.dispatch(beginDrag());                             // dragging = true (+ wakes via watchWake)
    store.dispatch(cancelCameraTween());                    // a grab interrupts any animation
  },
  onGestureEnd:   () => store.dispatch(endDrag()),           // dragging = false; engine commits on the edge
  onChange:       () => scheduler.requestRender(),           // the wake (replaces onCameraChange 1:1)
});
// onMove still does: state.cam.yaw -= dx*SENS; updatePosition(state.cam); onChange();
```

This is **strictly less machinery than a delta stream**: summation is just
integration in the register (what `orbitControls` already does), per-frame sampling
is just the engine producing one pose per frame, and there are **no** `cameraOrbit/
Pan/Zoom` actions, no throttle saga, no accumulate-and-sum, no `CameraManipulator`
type. `state.cam` stays the sanctioned mutable Resource — now demoted to *transient
gesture scratch*: seeded from `base` on grab, the `orbitDrag` driver's pose source
while `dragging`, committed back to `base` on release. Between gestures it is stale
and unread (the `resting` driver returns `base`, not `cam`).

The new edits to `orbitControls`: call `onGestureStart` in `onDown`, `onGestureEnd`
in `onUp` (when `activePointers` hits 0), rename `onCameraChange` → `onChange`. The
orbit/pan/zoom bodies are untouched.

---

## 4. How the pose lands in the engine (the existing read site)

The engine already polls the store per frame — `get settings()` is
`store.getState().settings` (`engine.ts:218`). `deriveFrameContext` produces the
pose where it reads `state.cam` today:

```ts
const s    = store.getState();
const pose = runCameraDrivers(drivers, s, state.cam, elapsed);   // returns the winner's pose
const vp   = computeViewProj(pose, aspect);                      // unchanged downstream

// commit-on-edge — ONE dispatch when the active driver leaves a non-resting state.
const active = activeDriverId(drivers, s);
if (prevActiveId !== active && prevActiveId !== 'resting' && prevActiveId !== 'orbitDrag-still')
  store.dispatch(commitCameraPose(baseOf(lastPose)));
prevActiveId = active; lastPose = pose;
```

`runCameraDrivers` is a pure function of `(driver list, store intent, gesture
register, elapsed)`; the impure reads (the mutable register, the clock) happen at
this call site — `intent.md`'s "dereference the resource at the edge." The renderers
read the produced `vp` exactly as today; no `store.subscribe`, no mirror.

### Wake + loop continuation

- **Wake (mouth):** the landed `watchWake` matches **`settings/` only**
  (`isSettingsWrite = a.type.startsWith(`${settingsRoute}/`)`, `reconcileSagas.ts`).
  The `camera` slice is a **new root route**, so its actions are not caught today —
  the one change this spec makes to landed reconcile code. **Generalize the wake
  predicate to a `WAKE_ROUTES` set** (`settings` + `camera`, and `selection` when it
  lands) rather than a parallel `watchCameraWake` — wake-on-scene-write is not a
  settings-specific concern. `requestRender` is idempotent (`renderScheduler.ts:77`),
  so `beginDrag`, `startCameraTween`, and the auto-rotate toggle each wake the loop;
  the in-gesture `onChange` wake covers the per-move frames.
- **Continuation (predicate):** the frame tail keeps rescheduling while a non-resting
  driver is active. The closure predicate becomes a selector:
  `selectCameraActive(s) = s.camera.dragging || s.camera.tween !== null || s.camera.autoRotate.active`.

---

## 5. What changes in the existing camera subsystems

- **`cameraDrivers.ts` is KEPT and reworked**, not deleted (this is the abstraction
  the design leans on): `CameraDriver` gains `pose` (replacing the void `apply`);
  `runCameraDrivers` returns the winner's pose; `buildCameraDrivers` gains the
  `orbitDrag` and `resting` rows and reads store intent. Priority arbitration and
  the single-writer/no-blending guarantee are unchanged.
- **`tweenManager.ts` is dissolved.** Its private `currentTween` → `state.camera.tween`;
  `start()` → `dispatch(startCameraTween)` (engine fills `from = lastPose`);
  `cancel()` → `dispatch(cancelCameraTween)`; `isActive()` → `selectCameraActive`;
  `advance()` → the `tween` driver's `pose: evaluate(descriptor, elapsed)`. The
  documented wake contract is preserved — `startCameraTween` wakes via `watchWake`;
  the per-frame `evaluate` is interior, wake-free.
- **`cameraTween.ts` easing is reused** as the pure `evaluate(descriptor, elapsed)`
  (today's `advanceCameraTween` mutates `cam`; the pure form returns a pose).
- **`orbitControls.ts` is reworked** per §3 (gesture hooks, `onChange`); its
  orbit/pan/zoom math is untouched.

---

## 6. Correctness invariants (verify in planning)

- **No visible motion change.** Per-move `state.cam` mutation + next-frame produce is
  identical to today's mutate + next-rAF render. Pin with a drag-sequence test.
- **No jump on any handoff.** `commitCameraPose(lastPose)` folds the *last produced*
  pose into `base` on the deactivation edge, so the next driver (usually `resting` or
  `orbitDrag` seeded from `base`) starts exactly where the last left off. Test: grab
  mid-tween, assert `base == evaluate(descriptor, elapsedAtGrab)`.
- **`runCameraDrivers` / `evaluate` / `spin` are pure.** Same inputs → same pose; no
  mutation, no I/O. Testable with a plain intent literal, a fake `cam`, a fake
  `elapsed` (mirrors the existing `runCameraDrivers` purity test).
- **Single writer per frame.** Exactly one driver yields the pose; no blending.
- **Synchronous post-write intent.** The frame's `getState()` reads post-dispatch
  intent (the store notifies synchronously, as `get settings()` already relies on).
- **Serializable, clock-free intent.** `base`, `tween`, `autoRotate`, `dragging` are
  plain data — no `Set`, no class, no GPU handle, **no wall-clock** (the clock is an
  engine Resource).
- **`commitCameraPose` fires once per transition**, never per frame (assert via the
  edge guard).

---

## 7. Blast radius

**Add:** `src/state/camera/cameraSlice.ts` + selectors (`selectCameraIntent`,
`selectCameraActive`); `src/@types/camera/CameraState.d.ts`,
`CameraTweenDescriptor.d.ts`; `src/services/engine/camera/evaluateTween.ts` (pure,
from `cameraTween` math) + `spinAutoRotate.ts`; `src/store/constants.ts`
(+`cameraRoute`); the engine-side clock + `lastPose`/`prevActiveId` + commit-on-edge
in `deriveFrameContext`.

**Rework:** `src/store/rootReducer.ts` (+`camera` slice);
`src/store/effects/reconcileSagas.ts` (generalize `isSettingsWrite` → a `WAKE_ROUTES`
matcher covering `camera`); `src/state/settings/settingsSlice.ts` (remove
`setAutoRotate` + the `settings.camera` sub-object — relocated); the SettingsPanel
auto-rotate toggle; `src/services/engine/camera/cameraDrivers.ts` (`CameraDriver.pose`,
`runCameraDrivers` returns a pose, `buildCameraDrivers` gains `orbitDrag`/`resting` +
reads store intent); `src/services/camera/orbitControls.ts` (gesture hooks, `onChange`);
`src/services/engine/frame/deriveFrameContext.ts` (produce the pose + commit-on-edge);
the engine `focusOn`/fly-to handles (`tweenToGalaxy`/`tweenToStructure`/`cameraSnapshot`
fill `from = lastPose` and dispatch `startCameraTween`); `engine.ts` (drop
`createTweenManager` wiring).

**Delete:** `src/services/engine/camera/tweenManager.ts` +
`src/@types/camera/TweenManager.d.ts`; the `onCameraChange` option on
`OrbitControlsOptions`; the per-site `onCameraChange` calls.

**Unchanged:** `cameraTween.ts` easing curve (reused by `evaluateTween`);
`computeViewProj` + all renderer uniform writes; the HDR passes; the `OrbitCamera`
shape (now used as the gesture register + produced-pose type).

**Builds on (landed):** the reconcile-sagas seam (PR #352). This slice's wake rides a
**generalized** `watchWake` — the one edit it makes to landed reconcile code.

---

## 8. Build order (suite green at each step)

The cutover rule (grill Q3): **never derive-from-the-new-home before every writer
fills it.** `state.cam` stays the bridge until the last step.

1. **Slice + pure pieces, no consumers.** Add the `camera` slice + `cameraRoute` +
   selectors; add `evaluateTween` / `spin` (unit-tested against literals); rework
   `CameraDriver.pose` / `runCameraDrivers` to return a pose but keep the old
   `apply`-style drivers writing `state.cam` for now. Additive; engine still reads
   `state.cam`.
2. **Writers populate the slice, engine still reads `state.cam` (bridge).** Tween →
   `startCameraTween` + the `tween` driver, *also* keeping `state.cam` in sync via a
   temporary commit each frame; auto-rotate → `setAutoRotate` + driver; drag →
   `beginDrag`/`endDrag` + `commitCameraPose`. Every step renders identically because
   the read is still `state.cam`. Suite green throughout.
3. **Flip the read (cutover).** `deriveFrameContext` switches to
   `runCameraDrivers(drivers, getState(), state.cam, elapsed)` + commit-on-edge, with
   `state.cam` now only the `orbitDrag` register. Delete the temporary per-frame sync.
4. **Throttle-free input + wake.** `orbitControls` → gesture hooks + `onChange`;
   generalize `watchWake` to `WAKE_ROUTES`; remove `onCameraChange`.
5. **Trim.** Delete `tweenManager` + `createTweenManager` wiring + the
   `OrbitControlsOptions.onCameraChange` option; relocate `autoRotate` out of
   `settings`; freeze the surviving camera surface.

---

## References

- [`intent.md`](../../superpowers/conventions/intent.md) — the four-layer table (live
  pose = Resource; target/auto-rotate/focus = Intent), the "60×/second is absurd"
  smell test, and the descriptor-bridges-a-resource pattern. This spec **refines**
  intent.md's camera example — an orbit camera has no separable "position register";
  what's stored is the *base accumulator* + *descriptors*, and the pose is produced by
  the driver table. (Fold the correction into intent.md when this lands.)
- [`simplicity.md`](../../superpowers/conventions/simplicity.md) — §5 (value/place;
  concentrate mutation in the transient register), §7 (the driver **table** is a
  registry, not a scattered switch), §8 (single home for the resting pose — `base`).
- [Engine handles → reconcile sagas](./2026-06-19-engine-handles-to-reconcile-sagas-design.md)
  — **landed** (PR #352). The `setSagaContext` / `ReconcileEffects` / `watchWake` seam
  this rides; camera writes wake once `watchWake`'s predicate is generalized to
  `WAKE_ROUTES` (§4).
- [Selection into the Intent Store](./2026-06-18-selection-into-intent-store-design.md)
  — the attention-ladder fold `focusOn` composes with; shipped separately.
- Current camera subsystems: `cameraDrivers.ts` (the driver table this reworks),
  `tweenManager.ts` (the closure this dissolves), `orbitControls.ts` (the
  `onCameraChange` pairing this retires), `cameraSnapshot.ts` (the commit-pose
  builder), `cameraTween.ts` (easing reused by `evaluateTween`), `renderScheduler.ts`
  (idempotent wake).
