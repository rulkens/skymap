# Camera intent into the store; pose derived in the frame (design)

> **Status:** approved direction, awaiting implementation plan. **Builds on** the
> landed reconcile-sagas seam (PR #352, `a1af66d6`) — `setSagaContext` /
> `ReconcileEffects` / `getContext('reconcile')` / `watchWake` are on `main`.
> **Why this exists:** the camera is a mutable `OrbitCamera` struct
> (`state.cam`) written every frame by three producers — drag input, an in-flight
> tween, and auto-rotate — and its "a change needs a frame" wake is hand-paired at
> each `orbitControls` mutation site via an `onCameraChange` callback
> (`orbitControls.ts:247,336,413,446,483`). That is a mutable place reachable by
> several writers with a scattered, easy-to-forget wake — the value/place +
> single-source-of-truth knot [`intent.md`](../../superpowers/conventions/intent.md)
> and [`simplicity.md`](../../superpowers/conventions/simplicity.md) §5/§8 exist to
> remove. This folds the camera's **Intent** into the store (alongside settings,
> selection, tier, ui), drives it through the same `reconcile-sagas` seam, lets
> sagas throttle the high-frequency input stream, and keeps the **per-frame
> interpolated pose derived** — never stored, never mirrored.

## The decision in one line

The store holds camera **intent** — the drag-accumulated **base pose**, the active
**tween descriptor**, and **auto-rotate** params — never the per-frame
interpolated pose. Continuous input (drag / pan / zoom / pinch / SpaceMouse) is
**saga-throttled** into base-pose writes; discrete commands (`focusOn`, fly-to)
dispatch a **tween descriptor once**. The frame derives the active pose via a pure
`resolveCameraPose(intent, now)` (which replaces `cameraDrivers`' priority scan),
and the engine reads it through a `get cam()` getter that mirrors today's
`get settings()`. The pose **lands back in the engine by pull, not push** — the
frame already polls the store.

### Why store the intent, not the pose

The naive "put the pose in the store and pull it" fails on two skymap specifics
that single-producer camera systems don't have:

1. **The pose is an integrator with three full-rate producers.** `yaw += dyaw`
   needs the previous yaw — a drag is a fold over time, not a pure function of
   (intent, now). And the register is written every frame by the **tween** and
   **auto-rotate** as well as drag. For the store to be the pose's authoritative
   home, *all three* must write it — including the tween's per-frame interpolation
   step. Throttling fixes input sampling (you can drop intermediate pointermoves)
   but **cannot** fix animation playback: a tween must play every frame, so it
   would either dispatch at 60 fps (the action-log-as-sample-buffer smell) or
   mutate imperatively while a throttled pose sits stale in the store — a mirror.

2. **Storing the descriptor, not the pose, dissolves both.** A tween's pose is
   `evaluate(descriptor, now)` — a pure function of store intent + frame time. So
   the **descriptor is dispatched once** and the frame evaluates it every frame
   with zero further dispatches. The same trick removes the auto-rotate tick:
   store `{ startTime, rate }` and derive the spin from elapsed time. The only
   thing never in the store is the per-frame *interpolated* value, which the frame
   computes and the renderers read.

What remains in the store is therefore genuine, serializable Intent. The
descriptor's payoff is **in-session**: derivation without a tick storm, and a clean
tween→drag handoff (below). It is *not* a deep-link-of-motion mechanism — a
deep-link is `#focus=<ref>` (a focus target ref, `focusUrl.ts`), gated on
catalog-ready, that **produces an arrival tween home→target on load**; it never
serializes the live pose or a descriptor. Motion *recording* is a separate tour
feature with its own relative-time beat list. The live tween descriptor is
**session-local** (see §2 on the clock).

## Scope

**In scope — fold into the store + reconcile sagas:**

- A new `camera` root slice holding **base pose** (`{ target, yaw, pitch,
  distance }`), the active **tween descriptor** (`{ from, to, start, duration,
  easing } | null`), and **auto-rotate** (`{ active, startTime, rate }`).
- Continuous-input → **throttled** `cameraOrbit` / `cameraPan` / `cameraZoom`
  delta actions folded into the base pose (replacing the `onCameraChange`
  callback wiring in `orbitControls`).
- Discrete camera commands dispatching a **tween descriptor** once
  (`startCameraTween`) — the effect path `focusOn` / fly-to already lead into
  (`tweenToGalaxy`/`tweenToStructure` today call `tweens.start`).
- `resolveCameraPose(intent, now)` — the pure derivation that replaces
  `cameraDrivers` + `tweenManager`'s closure, run in `deriveFrameContext`.
- The engine `get cam()` getter (pull), and the **loop-continuation predicate**
  (`autoRotate || activeTween`) re-expressed as selectors.
- The **commit-on-transition** dispatch: when an animation ends (tween settles, or
  a grab/auto-rotate-off cancels it) the engine folds the live evaluated pose into
  the base — one dispatch per transition, not per frame.

**Out of scope (do not scope-creep):**

- **The selection / attention ladder** (hover → select → focus). Its own fold —
  [selection-into-intent-store](./2026-06-18-selection-into-intent-store-design.md).
  `focusOn` *selects* (selection slice) and *commands a tween* (this slice); the
  two compose but ship separately.
- **The tween easing math.** `advanceCameraTween` / `cameraTween.ts` is reused
  verbatim as the `evaluate(descriptor, now)` body — no animation-curve change.
- **The tour driver** (priority 80, still unbuilt — see `cameraDrivers.ts:103`).
  It slots in as the highest-priority branch of `resolveCameraPose` later; this
  spec lands the two existing drivers (tween, auto-rotate) plus base.
- **GPU upload / matrix code.** `computeViewProj`, the per-renderer uniform writes,
  and the HDR passes are unchanged — they read the derived pose where they read
  `state.cam` today.
- **Any motion-feel change.** Throttle cadence is chosen to be visually
  indistinguishable from today (≈ one sample per frame); easing, clamps, and
  auto-rotate rate are moved verbatim.

---

## 1. The model

Camera Intent has **two kinds**, and the derived pose is a pure function of them
plus frame time:

| In the store (Intent — serializable) | Derived in `deriveFrameContext` (never stored) |
| --- | --- |
| **base pose** `{ target, yaw, pitch, distance }` — the committed resting state | the **active pose** `{ target, yaw, pitch, distance }` |
| **tween descriptor** `{ from, to, start, duration, easing } | null` — dispatched once | view-proj matrix, `position`, `drawPxPerRad` |
| **auto-rotate** `{ active, startTime, rate }` | |

```
input (drag/pan/zoom/pinch/spacemouse)
   └─ throttle saga ─▶ cameraOrbit/Pan/Zoom ─▶ camera slice (base pose)
focusOn / fly-to ─────▶ startCameraTween(descriptor) ─▶ camera slice (descriptor)
toggle auto-rotate ───▶ setAutoRotate ────────────────▶ camera slice (auto-rotate)
                                                              │ (store notifies)
                       reconcile saga ─▶ requestRender ◀──────┤  (wake at the mouth)
                                                              ▼
engine  get cam()  ─pull every frame─▶  resolveCameraPose(intent, now)  ─▶ computeViewProj ─▶ renderers
                                                              │
                  animation ends ─▶ engine dispatch commitCameraPose(derivedPose)  (fold into base, once)
```

`resolveCameraPose` is the priority arbitration `cameraDrivers` does today, as a
pure derivation over store intent:

```
resolveCameraPose(intent, now):
   intent.tween      ? evaluate(intent.tween, now)                      // priority: tween
 : intent.autoRotate.active
                     ? { ...intent.base, yaw: base.yaw + elapsed*rate } // priority: auto-rotate (time-eval)
 : intent.base                                                          // resting / drag accumulator
```

Branch order **is** the driver priority (`tween` 60 > `autoRotate` 20 > base), so
the data that today lives as `priority` numbers on `CameraDriver`s becomes the
order of this expression. No blending (the single-writer guarantee
`cameraDrivers.ts:75` bakes in) survives by construction — exactly one branch
yields the pose.

### Two animated drivers, one shape: dispatch-once, derive, commit-on-end

Both `tween` and `autoRotate` follow the identical lifecycle, which is the heart
of "no per-frame dispatch":

- **Start** — one dispatch installs the descriptor (`startCameraTween` /
  `setAutoRotate({ active: true, startTime, rate })`).
- **Run** — the frame derives the pose from `(descriptor, base, now)`. Zero
  dispatches. The base is untouched and stale-but-irrelevant while the animation
  owns the pose.
- **End** — the **engine** (the only party that knows `now` and the evaluated
  pose) dispatches `commitCameraPose(derivedPose)` once, folding the live pose
  into the base, then clears the descriptor. Subsequent drag integrates from where
  the animation landed — no jump.

A user **grab** mid-animation is just an early end: `pointerdown` dispatches
`cancelCameraTween`; the engine commits the live evaluated pose into base on the
next frame and the drag takes over. This is the existing **cancel-on-grab
handshake** (`wireInput.ts:172`), now expressed as commit + clear rather than a
closure `tweens.cancel()`. `cameraSnapshot.ts` already captures a pose for exactly
this purpose — it becomes the `commitCameraPose` payload builder.

> **Why the engine commits, not a reducer.** The settled pose depends on `now`
> (elapsed since `start`), which is frame knowledge, and `Date.now()` in a reducer
> is impure (and banned in this codebase). So the engine — which computes the
> evaluated pose every frame anyway — projects the final value into the store on
> the transition. This is `intent.md`'s descriptor pattern ("the resource layer's
> commit path dispatches a fact"): one dispatch per animation end, not per frame.

---

## 2. The camera slice (Intent)

```ts
// src/state/camera/cameraSlice.ts  (inline-Immer, like settingsSlice)
type CameraState = {
  base: { target: Vec3; yaw: number; pitch: number; distance: number };
  tween: CameraTweenDescriptor | null;            // serializable: from/to/start/duration/easing
  autoRotate: { active: boolean; startTime: number; rate: number };
};

reducers: {
  // continuous input — throttled deltas folded into the accumulator
  cameraOrbit (s, { payload: { dyaw, dpitch } }) { s.base.yaw -= dyaw; s.base.pitch = clampPitch(s.base.pitch - dpitch); },
  cameraPan   (s, { payload: { delta } })        { vec3Add(s.base.target, delta); },
  cameraZoom  (s, { payload: { factor } })       { s.base.distance = clampDistance(s.base.distance * factor); },
  // commit the live evaluated pose (engine, on animation end / grab)
  commitCameraPose (s, { payload }) { s.base = payload; },
  // descriptors — dispatched once
  startCameraTween  (s, { payload }) { s.tween = payload; },
  cancelCameraTween (s)              { s.tween = null; },
  setAutoRotate     (s, { payload }) { s.autoRotate = payload; },
}
```

**Clamps split by kind, deliberately.** `clampPitch` (pole saturation) and
`clampDistance` stay in the **reducer** — they are constraints on the *state
value* (a saturating integrator: orbit past the pole and the accumulator must
hold, so the next delta integrates from a valid value). This is **not** the
display-clamp case the reconcile-sagas spec moves to the read edge
(`clampVolumeContrast` et al. clamp an *output mapping*). The distinction is
essential, not an oversight: a state-saturating clamp belongs with the integrator;
an output clamp belongs at the consumption edge. (Radar note for the plan: keep
these two clamp kinds named distinctly so neither migrates to the other's home.)

`base` is genuine Intent: "where the user dragged to," serializable. In
single-producer camera systems this base *is* the whole pose — which is why storing
it has always worked; skymap only adds the two animated descriptors on top.

**`autoRotate` relocates, it isn't greenfield.** PR #352 dissolved
`camera.setAutoRotate` into a direct `settings/` write — it currently lives at
`settings.camera.autoRotate` (`settingsSlice.ts:91`). This spec **moves** it into
the new `camera` slice as `{ active, rate }`; the `settings/setAutoRotate` action
and the now-empty `settings.camera` sub-object are removed, and the SettingsPanel
toggle dispatches the camera-slice action instead. (It is wake-only — not in
`FADE_ROW` — so only the wake-route generalization in §4 carries it.)

---

## 3. Input throttling (sagas)

Continuous input handlers stop mutating `cam` + calling `onCameraChange`, and
instead emit **raw delta actions** that a throttling saga coalesces to frame
cadence:

```ts
// orbitControls emits, per pointermove/wheel/pinch tick:
dispatch(cameraOrbitRaw({ dyaw, dpitch }));   // command, reducer-less

// src/store/effects/cameraInputSaga.ts — accumulate within a frame, flush once
function* watchOrbit() {
  yield* throttle(FRAME_MS, cameraOrbitRaw, function* (a) {
    yield* put(cameraOrbit(a.payload));       // the actual base-pose write
  });
}
```

`throttle` (leading-edge + trailing flush) samples the input at ≈ one per frame —
visually identical to today, where every move mutates `cam` but only the next rAF
renders it. Pan and zoom get sibling watchers. (Planning note: confirm whether a
simple `throttle` or an accumulate-and-flush worker best preserves sub-frame
delta *sums* — a drag that fires 3 moves in one frame should orbit by their sum,
not the last. Accumulation may move into the saga; the slice still sees one
folded write per frame.)

The throttle is the load-bearing piece — sagas absorbing the high-frequency input
stream so the store only ever sees coarse, frame-cadence writes. It is exactly why
the camera *can* go through the store without a dispatch storm: the store is never
asked to record the analog signal, only its per-frame sample.

---

## 4. How the pose lands in the engine (pull, via the existing seam)

The engine already polls the store per frame — `get settings()` is
`store.getState().settings` (`engine.ts:218`). The camera reads back the same way:

```ts
get cam() { return store.getState().camera; }                 // the INTENT (base + descriptors)
```

`deriveFrameContext(state, canvas)` then computes the **pose** before
`computeViewProj`:

```ts
const pose = resolveCameraPose(state.cam, nowMs);             // pure derivation (replaces runCameraDrivers)
const vp   = computeViewProj(pose, aspect);                  // unchanged
```

No `store.subscribe`, no copy into a register, no mirror: the frame loop is the
puller, and `resolveCameraPose` is a pure function of (polled intent, frame time).
The renderers read `ctx.vp` exactly as today.

**Animation-end commit** is the one engine→store write. `deriveFrameContext` (or a
thin post-step) detects a tween that finished this frame (`evaluate` reports
`now >= start + duration`) or an auto-rotate that was toggled off, and dispatches
`commitCameraPose(pose)` + the matching clear — once.

### Wake + loop continuation

- **Wake (mouth):** the landed `watchWake` matches **`settings/` only**
  (`isSettingsWrite = a.type.startsWith(`${settingsRoute}/`)`, `reconcileSagas.ts`).
  The `camera` slice is a **new root route** (like `tier`/`ui`), so its actions are
  **not** caught today — this is the one change this spec makes to landed reconcile
  code. **Generalize the wake predicate to a `WAKE_ROUTES` set** (`settings` +
  `camera`, and `selection` when it lands) rather than adding a parallel
  `watchCameraWake` — wake-on-scene-write is not a settings-specific concern, and a
  set keeps it one matcher. `requestRender` stays idempotent (`renderScheduler.ts:77`),
  so the throttled input writes, `startCameraTween`, and the auto-rotate toggle each
  wake the loop with no per-site `onCameraChange`.
- **Continuation (predicate):** the frame tail keeps rescheduling while an
  animation owns the pose. The closure predicate `autoRotate || currentTween`
  becomes a selector over store intent:
  `selectCameraAnimating(s) = s.camera.tween !== null || s.camera.autoRotate.active`.
  Reading it via `get cam()` keeps the loop alive through an animation without
  dispatching per frame.

---

## 5. What `tweenManager` / `cameraDrivers` become

They don't vanish — they **invert** from closure-owned mutable state into store
intent + a pure derivation:

- `tweenManager`'s privately-held `currentTween` → `state.camera.tween` (store).
  Its `start()` → `dispatch(startCameraTween)`; `cancel()` →
  `dispatch(cancelCameraTween)`; `isActive()` → `selectCameraAnimating`;
  `advance()` → the `tween` branch of `resolveCameraPose`. The documented **wake
  contract** ("start wakes; advance/cancel are wake-free") is preserved — start
  wakes via `watchWake`; the derivation in the frame is interior, wake-free.
- `cameraDrivers`' priority scan → the branch order of `resolveCameraPose`. The
  "exactly one writer per frame, no blending" property holds by construction (one
  branch yields). `buildCameraDrivers`/`runCameraDrivers` are deleted.
- `orbitControls`' five `updatePosition + onCameraChange` pairs → emit delta
  actions; the `onCameraChange` option is removed from its signature.

The net is the same arbitration and the same wake discipline, now as **data +
derivation** instead of closures + scattered callbacks.

---

## 6. Correctness invariants (verify in planning)

- **No visible motion change.** Throttled-to-frame input is indistinguishable from
  per-move mutate + next-rAF render. Pin with a test that a sequence of raw deltas
  in one frame produces the same base pose as today's summed mutations.
- **No jump on animation→drag handoff.** `commitCameraPose` folds the *live
  evaluated* pose into base before the descriptor clears, so the resting pose the
  next drag integrates from equals the last rendered pose. Test: start a tween,
  cancel mid-flight, assert base == evaluate(descriptor, cancelTime).
- **`resolveCameraPose` is pure.** Same (intent, now) → same pose; no `cam`
  mutation, no I/O. Testable with a plain intent literal and a fake `now`
  (mirrors `runCameraDrivers`' existing purity test).
- **Single writer per frame.** Exactly one branch of `resolveCameraPose` produces
  the pose; no two drivers contribute.
- **Synchronous post-write intent.** The frame's `get cam()` reads post-dispatch
  intent (the store notifies synchronously, as `get settings()` already relies on).
- **Serializable intent.** `base`, `tween`, `autoRotate` are plain data (no `Set`,
  no class, no GPU handle) — a deep-link/tour can snapshot and replay them,
  including a mid-flight tween.

---

## 7. Blast radius

**Add:** `src/state/camera/cameraSlice.ts` + selectors
(`selectCameraIntent`, `selectCameraAnimating`); `src/@types/camera/CameraState.d.ts`,
`CameraTweenDescriptor.d.ts`; `src/services/camera/resolveCameraPose.ts` (pure);
`src/store/effects/cameraInputSaga.ts` (throttle watchers); the
`commitCameraPose`-on-transition step in `deriveFrameContext`.

**Rework:** `src/store/rootReducer.ts` (+`camera` slice) + `src/store/constants.ts`
(+`cameraRoute`); `src/store/effects/reconcileSagas.ts` (generalize `isSettingsWrite`
→ a `WAKE_ROUTES` matcher covering `camera`); `src/state/settings/settingsSlice.ts`
(remove `setAutoRotate` + the `settings.camera` sub-object — relocated to the camera
slice); the SettingsPanel auto-rotate toggle (dispatch the camera-slice action);
`src/store/rootSaga.ts` (compose the input watchers);
`src/services/camera/orbitControls.ts` (emit deltas, drop `onCameraChange`);
`src/services/engine/engine.ts` (`get cam()` returns store intent; remove
`createTweenManager` wiring); `src/services/engine/frame/deriveFrameContext.ts`
(call `resolveCameraPose` + commit-on-end); `src/services/engine/frame/runFrame.ts`
(drop `runCameraDrivers`); the engine `focusOn`/fly-to handles
(`tweenToGalaxy`/`tweenToStructure`/`cameraSnapshot` dispatch `startCameraTween`
instead of `tweens.start`); `engine.ts` `get cam()` consumers that assumed a live
mutable `OrbitCamera` (audit — most read `ctx`/pose, not `cam` directly).

**Delete:** `src/services/engine/camera/tweenManager.ts` +
`src/@types/camera/TweenManager.d.ts`; `src/services/engine/camera/cameraDrivers.ts`
(`buildCameraDrivers`/`runCameraDrivers`) + `CameraDriver.d.ts`; the
`onCameraChange` option on `OrbitControlsOptions`; the per-site `onCameraChange`
calls.

**Unchanged:** `cameraTween.ts` easing (reused as `evaluate`); `computeViewProj`
and all renderer uniform writes; the HDR passes; `state.cam` *shape* (now sourced
from the store, same fields).

**Builds on (landed):** the reconcile-sagas seam (`setSagaContext` /
`ReconcileEffects` / `getContext('reconcile')` / `watchWake`) is on `main` (PR
#352). This slice's wake rides a **generalized** `watchWake` (§4) — the one edit it
makes to landed reconcile code.

---

## 8. Build order (suite green at each step)

1. **Slice, no consumers.** Add the `camera` slice + selectors +
   `resolveCameraPose` (pure, unit-tested against intent literals). Nothing reads
   it yet. Additive.
2. **Derive the pose from the slice.** `deriveFrameContext` calls
   `resolveCameraPose(store.getState().camera, now)` instead of mutating + reading
   `state.cam`; seed the slice `base` from the current camera at init. Tween +
   auto-rotate still driven by the old subsystems writing base via
   `commitCameraPose` each frame *temporarily* — both paths agree (parity), suite
   green.
3. **Move the tween into the slice.** `focusOn`/fly-to dispatch
   `startCameraTween`; `resolveCameraPose` evaluates it; engine commits on settle;
   delete `tweenManager`. Auto-rotate likewise → `setAutoRotate` + time-eval +
   commit-on-stop; delete `cameraDrivers`.
4. **Throttle input into the slice.** `orbitControls` emits raw deltas;
   `cameraInputSaga` folds them; remove `onCameraChange`. The wake now comes from
   `watchWake`.
5. **Trim.** Remove the dead `OrbitControlsOptions.onCameraChange`, the
   `createTweenManager` wiring, and the driver types; freeze the surviving camera
   surface.

---

## References

- [`intent.md`](../../superpowers/conventions/intent.md) — the four-layer table
  (live pose = Resource; target/auto-rotate/focus = Intent), the "dispatching it
  60×/second would be absurd" smell test, and the **descriptor-bridges-a-resource**
  pattern this spec applies to the tween. Note: this spec **refines** intent.md's
  camera example — an orbit camera has no separable "position register"; the whole
  orbit register is derived, and what's stored is the *base accumulator* +
  *descriptors*, not the interpolated pose. (Fold the correction back into
  intent.md when this lands.)
- [`simplicity.md`](../../superpowers/conventions/simplicity.md) — §5 (value/place;
  concentrate mutation), §7 (priority numbers → branch order is still a registry,
  not a scattered switch), §8 (single source of truth — the pose stops having two
  homes).
- [Engine handles → reconcile sagas](./2026-06-19-engine-handles-to-reconcile-sagas-design.md)
  — **landed** (PR #352). The `setSagaContext` / `ReconcileEffects` / `watchWake`
  seam this rides; camera writes wake through `watchWake` once its predicate is
  generalized from `settings/`-only to a `WAKE_ROUTES` set (§4).
- [Selection into the Intent Store](./2026-06-18-selection-into-intent-store-design.md)
  — the attention-ladder fold `focusOn` composes with (select + command-a-tween),
  shipped separately.
- Current camera subsystems being inverted: `tweenManager.ts` (closure tween +
  wake contract), `cameraDrivers.ts` (priority arbitration), `orbitControls.ts`
  (the `onCameraChange` pairing), `cameraSnapshot.ts` (the commit-pose builder),
  `renderScheduler.ts` (idempotent wake).
