# Grill Session: Camera intent into the store — 2026-06-19

Source: design conversation off the question "the camera is a mutable object — what would it mean to fold it in as a store slice?" Produced
[`specs/2026-06-19-camera-intent-slice-design.md`](../superpowers/specs/2026-06-19-camera-intent-slice-design.md).

We're folding the camera's Intent into the Redux store (alongside settings/tier/ui/selection) without storing the per-frame interpolated pose, keeping the render loop performant and the design aligned with `intent.md` (live pose = Resource). This session stress-tested the spec branch by branch.

---

## Q1: Deep-link / snapshot semantics mid-tween — resume the motion, or freeze the pose?

**The question:** The first spec draft claimed "tours and deep-links capture in-flight camera motion for free" because the tween descriptor lives in the store. Is that real, and does a deep-link want the recipient to *resume* a fly-through or *land* at a pose? This decides whether the descriptor is serialized into a deep-link and how its time field is represented.

**Considerations:**
- **Option A (deep-link serializes the live descriptor):** recipient resumes the motion. Forces the descriptor's `start` to be relative + re-based on load; pollutes the share payload with transient animation state. The "for free" claim only holds with a re-basing step that wasn't specced.
- **Option B (deep-link = frozen pose):** serializes only the resting pose; recipient lands where you were. Descriptor stays session-local.
- **Ground truth (from the user):** skymap's deep-link is already `#focus=<id>` — a *focus target ref* (`focusUrl.ts`: famous id / `pgc-` / `sdss-` / `pos@` / `structure-`), gated on catalog-load, which **tweens home→target on load**. It serializes neither a pose nor a descriptor.

**Decision:** The deep-link is a **focus ref → arrival tween on load** (existing behaviour, owned by the selection fold). The tween descriptor is **session-local**, never serialized. The "captures motion for free" claim was wrong and was deleted; the descriptor's real payoff is in-session (no tick storm + uniform handoff). Motion *recording* is a separate tour feature with its own relative-time beat list.

---

## Q2: Animation clock — absolute `start` in the stored descriptor, or engine-tracked elapsed with a timeless descriptor?

**The question:** The draft wrote `tween: { from, to, start, duration, easing }` with `start = nowMs`. Where does the clock live?

**Considerations:**
- **Option A (absolute `start` in the store):** descriptor is self-describing. But the *dispatcher* (a SettingsPanel toggle, a focus handler) has no `nowMs` to stamp — so every camera command becomes engine-mediated just to fill the time. It also puts wall-clock into the serializable store, and `Date.now()` is impure/banned across much of the codebase.
- **Option B (timeless descriptor; engine owns the clock as a Resource):** store holds `{ from, to, duration, easing }` and `{ active, rate }` — no time. The engine keeps `tweenStartMs`/`autoRotateStartMs`, reset when a descriptor's identity changes, and feeds `elapsed` to the drivers. Commit-on-transition becomes uniform and clock-free for the dispatcher: the engine keeps `lastPose` and, on any active→inactive edge, dispatches one `commitCameraPose(lastPose)`.

**Decision:** **Option B — timeless descriptors, engine-owned clock, commit-last-pose-on-edge.** Keeps the store serializable and wall-clock-free, removes the "dispatcher needs `nowMs`" problem, and makes the settle / grab-cancel / auto-rotate-off transitions one uniform rule. Cost: a small piece of engine-side clock state (a Resource, like the pose register), and the plan must nail edge-frame ordering (commit-then-resolve).

---

## Q3: Migration sequencing — does the build order need reordering?

**The question:** The draft's step 2 flipped `deriveFrameContext` to read the slice while input still flowed through the old `orbitControls` (mutating `state.cam`, not the slice) until step 4. Is that green-in-spirit?

**Considerations:**
- **Option A (draft order — derive-from-slice early):** between steps 2–4 a drag mutates `state.cam` while the screen renders the unchanged slice — the camera stops responding to the mouse for two steps. Tests might pass; the app is broken.
- **Option B (read-flip last, `state.cam` as bridge):** writers populate the slice first while the engine keeps reading `state.cam`; the read is flipped to the produced pose in *one* step once the slice is fully authoritative; then `state.cam` is demoted to the drag register.
- **Option C (single atomic cutover):** slice + derive + input in one big step. Larger non-green window closed only at the final commit; harder to review.

**Decision:** **Option B.** The cutover rule: *never derive-from-the-new-home before every writer fills it.* `state.cam` stays the migration bridge until the read-flip step; the trade is a temporary per-frame sync that's deleted at the flip. Beats C on reviewability.

---

## Q4: Input throttling — `throttle` drops deltas; accumulate-and-sum, and where?

**The question:** The draft sketched a `throttle(FRAME_MS, …)` saga to coalesce input. Is that correct, and is it the right shape at all?

**Considerations:**
- **Correctness:** redux-saga `throttle` takes the *leading* action and ignores the rest of the window — so 3 pointermoves in a frame dispatch the first delta and **drop two** → the drag under-rotates. Plain throttle is wrong; deltas must be **summed**.
- **Option A (saga accumulator):** buffer raw deltas, flush their sum once per frame-window. Keeps input in the store layer; timer-approximate cadence.
- **Option B (engine frame-drain):** input enqueues deltas; the engine sums + dispatches one `cameraOrbit(Σ)` per frame. Exact rAF sync, but spreads camera batching into the engine loop.
- **Reframe (the elegant exit):** the throttle is solving a problem we introduced by streaming deltas through the store. A drag is *continuous manipulation* whose pose is a Resource (`intent.md`). So **don't stream deltas at all** — integrate the gesture in the engine and dispatch **one** committed pose on `pointerup`. This makes drag symmetric with tween/auto-rotate (every driver commits on its end-edge) and deletes the throttle/accumulate apparatus entirely.

**Decision:** Reject both throttle options. **Drag is the third driver**: it integrates in an engine register and commits one pose on release. No `cameraOrbit/Pan/Zoom` actions, no throttle, no accumulate-and-sum, no sub-frame-sum bug. The store only ever sees gesture-boundary and descriptor actions. (Streaming every delta through the reducer — letting the reducer integrate — was noted as the throttle-free alternative *if* input must literally flow through the store, but rejected for ~120 dispatches/s of action-log noise.)

---

## Q5: Is a `CameraManipulator` abstraction necessary?

**The question:** The first sketch of "drag as a driver" introduced a 6-method `CameraManipulator` (begin/orbit/pan/zoom/end/current) owning a working pose. Is it needed?

**Considerations:**
- Everything the manipulator wraps already exists: the working pose is `state.cam` (orbitControls already mutates an `OrbitCamera`), the orbit/pan/zoom math is in `orbitControls`, and the wake is `onCameraChange → requestRender`. The *only* genuinely new behaviour is seed-on-grab and commit-on-release — two callbacks.
- A new 6-method type is a bigger interface than the job needs (`simplicity.md` #3) and mostly renames existing code without decomplecting anything.

**Decision:** **Drop the manipulator.** Reuse `state.cam` as the transient gesture register, add a `dragging` flag, and add two lifecycle hooks (`onGestureStart` → seed from `base` + `beginDrag` + cancel tween; `onGestureEnd` → `endDrag`). `orbitControls`' math is untouched. Net new surface: a boolean, a `seedFromBase`/`baseOf` pair, two callbacks — no new type, no new module.

---

## Q6: How is drag modelled — a bespoke branch, or a row in the existing `CameraDriver` table?

**The question:** With the manipulator gone, how does drag reach the pose computation? The user liked the idea of a *separate orbit-controls camera driver* rather than a `resolveCameraPose` if-chain.

**Considerations:**
- **Option A (`resolveCameraPose` if-chain):** a pure `dragging ? cam : tween ? … : base`. Works, but it discards the `CameraDriver` priority table the codebase already has and likes.
- **Option B (keep the `CameraDriver` table, make it return a pose):** `runCameraDrivers` changes from mutating `cam` (void `apply`) to **returning** the winner's pose. Rows: `orbitDrag` (80, pose = the gesture register `state.cam`), `tween` (60, pose = `evaluate(descriptor, elapsed)`), `autoRotate` (20, pose = `spin(base, rate, elapsed)`), `resting` (0, pose = `base`). Priority arbitration + single-writer/no-blending are preserved; the table stays a data-driven registry (`simplicity.md` #7).

**Decision:** **Option B.** Keep `cameraDrivers.ts` (reworked to return a pose, +`orbitDrag`/`resting` rows reading store intent); drag is a first-class driver fed by `orbitControls`' mutation of `state.cam`. `tweenManager` dissolves (descriptor → store, `advance` → the tween driver's `pose`). The uniform commit-on-edge (Q2) covers drag-release, tween-settle, and auto-rotate-off identically.

---

## Reconciliation note (mid-session): reconcile-sagas landed

PR #352 (engine settings-handles → reconcile sagas) merged to `main` during the session. The spec was re-checked against the landed code and corrected:
1. **`watchWake` matches `settings/` only** (`reconcileSagas.ts`), so the new `camera` root route needs the predicate generalized to a `WAKE_ROUTES` set — the one change this spec makes to landed reconcile code.
2. **`autoRotate` already moved** to `settings.camera.autoRotate` (a `settings/` action) in #352 — the spec now *relocates* it into the new slice rather than treating it as greenfield.
3. Dependency flipped from "blocks on merge" to "builds on landed PR #352." The branch merged `origin/main` so the spec/plan sits on the real reconcile code.

---

## Open (not yet grilled — carry into the plan)

- **`from` capture timing:** `startCameraTween.from = lastPose` is engine-supplied; confirm the focus handler reads the produced pose at dispatch time across a grab/tween overlap.
- **Sub-driver activation hooks:** clock-reset (tween/auto-rotate) vs seed (drag) vs commit (all) — confirm these live cleanly off the active-driver-id edge without re-growing a per-driver `enter/exit` interface.
- **`fov`/`aspect`/`near`/`far`:** stay engine/Resource (aspect = resize-derived; fov/near/far effectively constant), out of the slice — confirm no consumer expects them in `base`.
- **SpaceMouse / raw-input deltas:** route through the same `state.cam` mutation as mouse drag; audit `services/input`.
