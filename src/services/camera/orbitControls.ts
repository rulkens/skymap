/**
 * Orbit controls — maps DOM input events to `OrbitCamera` mutations.
 *
 * ### Responsibility split
 *
 * `orbitCamera.ts` owns the *math*: it knows how yaw, pitch, and distance
 * map to a world-space position and view-projection matrix. This module owns
 * the *input*: it watches DOM events on a `<canvas>` and translates pointer
 * deltas and wheel ticks into changes on those three numbers.
 *
 * Keeping input separate from math means the camera can be driven from tests,
 * animations, or network state without touching event listeners, and the event
 * handlers stay small and easy to reason about.
 *
 * ### Why pointer events, not mouse events?
 *
 * The Pointer Events API (`PointerEvent`) is a superset of mouse events that
 * also covers stylus pens and touch fingers. A single handler works for:
 *
 *   - `pointerdown` / `pointerup` / `pointermove`  (mouse, pen, touch)
 *
 * The older `mousedown` / `mousemove` API only fires for mice and is not
 * dispatched for touch on mobile browsers. Using pointer events means the
 * orbit controls work identically on a laptop trackpad, a Wacom tablet, and
 * a touch screen without any extra branching.
 *
 * ### Why move/up/cancel listen on `window`, not the canvas
 *
 * `pointerdown` is bound to the canvas (a gesture must *start* on the
 * drawing surface), but `pointermove` / `pointerup` / `pointercancel` are
 * bound to `window`. Two reasons, one of them load-bearing on iOS:
 *
 *   - **Drag-outside continuation.** A drag that leaves the canvas (over a
 *     UI panel, or past the viewport edge) must keep orbiting. `window`
 *     sees those moves regardless of what is under the pointer.
 *   - **iOS Safari capture bug.** Touch pointers get *implicit* pointer
 *     capture on `pointerdown`. WebKit mishandles an *explicit*
 *     `setPointerCapture()` layered on top of that implicit capture — it
 *     stops delivering `pointermove` / `pointerup`, so single-finger orbit
 *     and two-finger pinch both die on iPhone/iPad while desktop mouse
 *     (no implicit capture) is unaffected. The fix, used by every major
 *     touch-gesture library, is to NOT call `setPointerCapture` and bind
 *     the continuation events to `window` instead. (`touch-action: none`
 *     on the canvas — see global.css — still suppresses native scroll/zoom
 *     because that is keyed off the touch's *target* element, the canvas.)
 *     See https://github.com/openseadragon/openseadragon/issues/1962.
 *
 * ### Coordinate conventions
 *
 *   drag right (+dx) → yaw decreases → camera sweeps left past the scene
 *
 * This is sometimes called "globe" or "grab" drag: the user grabs the scene
 * and pulls it, so the world appears to rotate in the direction of the drag.
 * Contrast with "FPS" drag where moving the mouse right pans the *camera*
 * rightward (yaw increases). Globe drag feels more natural for inspecting
 * a fixed object like a galaxy cluster.
 *
 * ### Module role in the pipeline
 *
 *   DOM events → (this module) → OrbitCamera state → orbitCamera.ts → mat4
 */

import type { OrbitCamera } from '../../@types/camera/OrbitCamera';
import type { OrbitControlsOptions } from '../../@types/camera/OrbitControlsOptions';
import { updatePosition } from '../../utils/camera/updatePosition';
import { orbitRadPerPixel } from '../../utils/camera/orbitRadPerPixel';
import { surfaceDragRotation } from '../../utils/camera/surfaceDragRotation';
import { PITCH_LIMIT } from '../../utils/camera/pitchLimit';
import { imagePlaneBasis } from '../../utils/camera/imagePlaneBasis';
import { frameUp } from '../../utils/camera/frameUp';
import { orbitAnglesLookingAlong } from '../../utils/camera/orbitAnglesLookingAlong';
import { surfaceTiltAngle } from '../../utils/camera/surfaceTiltAngle';
import { vec3 } from 'wgpu-matrix';
import type { Vec3 } from '../../@types/math/Vec3';
import type { ImagePlaneBasis } from '../../@types/camera/ImagePlaneBasis';
import type { BodyId } from '../../@types/data/body/BodyId';
import type { LonLatDeg } from '../../@types/scene/LonLatDeg';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Gap (ms) above which a wheel tick starts a NEW gesture rather than
 * continuing the current one. Trackpad/Magic Mouse momentum scroll keeps
 * delivering ticks tens of ms apart after the fingers lift; 150 ms clears
 * that inertial spacing while staying well under the pause between two
 * separate, deliberate scrolls — see the mid-drag guard in `onWheel`.
 */
const WHEEL_GESTURE_GAP_MS = 150;

// ─── Controls ─────────────────────────────────────────────────────────────────

/**
 * Attach mouse/touch/pen orbit controls to a canvas element.
 *
 * Registers four event listeners on `canvas`:
 *
 *   - `pointerdown`  — start a drag, capture pointer
 *   - `pointerup`    — end a drag, release pointer
 *   - `pointermove`  — update yaw/pitch while dragging
 *   - `wheel`        — hand the zoom factor + cursor to the engine (`onZoom`)
 *
 * After each mutation the function calls `updatePosition(cam)` to keep
 * `cam.position` in sync. The render loop (Task 11) then reads
 * `computeViewProj(cam)` every frame.
 *
 * ### Teardown / cleanup
 *
 * Returns a zero-argument cleanup function that removes all four listeners.
 * This is the standard JavaScript idiom for *disposable* event bindings:
 *
 * ```ts
 * const detach = attachOrbitControls(canvas, cam);
 * // later, when the canvas unmounts or the view changes:
 * detach();
 * ```
 *
 * Callers that never need cleanup (e.g. a single-page app that lives for the
 * full document lifetime) can ignore the return value.
 *
 * @param canvas   The `<canvas>` element to listen on. Pointer events are
 *                 registered here so the hit-test area matches the viewport.
 * @param cam      The orbit camera to mutate. The caller owns this object;
 *                 `attachOrbitControls` only reads and writes its fields.
 * @param options  Optional configuration. Supports `onClick`, `onDoubleClick`,
 *                 `onChange` (wake the render loop after any mutation),
 *                 `onGestureStart` (first pointer contact — seed the drag
 *                 register + begin Redux drag), and `onGestureEnd` (all
 *                 pointers lifted — commit the final pose + end Redux drag).
 * @returns A teardown function — call it to remove all event listeners.
 */
export function attachOrbitControls(
  canvas: HTMLCanvasElement,
  cam: OrbitCamera,
  options?: OrbitControlsOptions,
): () => void {
  // Track drag state with module-level (closure) variables so the three
  // pointer handlers can share it without a wrapper object allocation.
  //
  // `dragMode` distinguishes a left-button orbit from a right-button (or
  // middle-button) pan, plus the touch-only `'pinch'` mode that fires when
  // a second finger touches down.  `null` means no drag in progress.
  type DragMode = 'orbit' | 'pan' | 'pinch' | 'tilt';
  let dragMode: DragMode | null = null;
  let lastX = 0; // client-space X of the previous pointermove event
  let lastY = 0; // client-space Y of the previous pointermove event

  // The body-surface point grabbed at gesture start (spec §4.4), captured
  // from `hoveredSurfacePoint()` on the FIRST contact — `null` until a hit
  // has landed. The orbit branch solves the exact cursor-anchored rotation
  // against this when it's still on the currently focused body; otherwise it
  // falls back to `orbitRadPerPixel`'s flat rate (the "Drag hit/miss
  // coexistence" constraint: hit and miss are branches of ONE drag path).
  let grabbedPoint: { bodyId: BodyId; point: LonLatDeg } | null = null;

  // Latched off for the REST of the gesture the first time the exact solve
  // declines (spec §4.4 / FW-D M1). The two paths quote different rad/px
  // currencies, so alternating between them event-by-event — which is the
  // common case near the limb, where solvability flickers pixel to pixel — is
  // felt as the drag repeatedly jumping and changing gear. One currency per
  // gesture is worth more than exactness on the events that still solve; a
  // fresh pointerdown re-grabs and re-arms.
  let exactSolveLatchedOff = false;

  // ── Multi-touch state ─────────────────────────────────────────────────────
  //
  // We track every active pointer in a small Map (id → last x/y) so we can
  // compute pinch geometry from any two of them.  For single-pointer drags
  // (orbit / pan) only `dragPointerId` matters — that's the contact that
  // started the gesture and whose moves drive the camera.  Other pointers
  // that arrive mid-gesture promote the mode to `'pinch'` and the
  // single-pointer driver is paused until everything's released.
  //
  // Why not use TouchEvent?  PointerEvent unifies mouse / pen / touch so
  // the existing orbit/pan code Just Works on a tablet stylus or a touch
  // screen, and adding pinch on top is a single multi-id case in here
  // rather than a parallel TouchEvent listener tree.
  const activePointers = new Map<number, { x: number; y: number }>();
  let dragPointerId: number | null = null;
  let lastPinchDist = 0;

  // ── Debug sample (DebugPanel Camera section) ──────────────────────────────
  //
  // `dragMode` and `activePointers` above have no other read surface outside
  // this closure; `onDebugSample` is the minimal way out. Wheel fields are
  // tracked here rather than reusing an existing variable because nothing else
  // in this module needs the last wheel event past the tick that produced it.
  let lastWheelDeltaY = 0;
  let lastWheelAtMs = 0;
  let lastWheelDropped = false;

  // Gesture-identity tracking for the inertial-momentum guard below.
  // `wheelGestureTickTs` is DISTINCT from `lastWheelAtMs` (display-only,
  // 0 ⇒ "never") — it starts at -Infinity so the very first-ever wheel tick
  // unconditionally begins a new gesture regardless of the process's real
  // uptime at that moment. `wheelGestureStartedMidDrag` is set only when a
  // new gesture starts, then carried unchanged across that gesture's
  // continuing ticks (gap ≤ WHEEL_GESTURE_GAP_MS).
  let wheelGestureTickTs = -Infinity;
  let wheelGestureStartedMidDrag = false;

  const emitDebugSample = (): void => {
    options?.onDebugSample?.({
      dragMode,
      activePointers: activePointers.size,
      wheelDeltaY: lastWheelDeltaY,
      wheelAtMs: lastWheelAtMs,
      wheelDropped: lastWheelDropped,
    });
  };

  /** Euclidean distance between the first two active pointers, or 0 if <2. */
  const currentPinchDistance = (): number => {
    const ptrs = Array.from(activePointers.values());
    if (ptrs.length < 2) return 0;
    const dx = ptrs[0]!.x - ptrs[1]!.x;
    const dy = ptrs[0]!.y - ptrs[1]!.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  /** Midpoint of the first two active pointers — a pinch's "cursor". */
  const currentPinchMidpointCss = (): { x: number; y: number } => {
    const ptrs = Array.from(activePointers.values());
    if (ptrs.length < 2) return { x: 0, y: 0 };
    return { x: (ptrs[0]!.x + ptrs[1]!.x) / 2, y: (ptrs[0]!.y + ptrs[1]!.y) / 2 };
  };

  // ── Click detection ────────────────────────────────────────────────────────
  //
  // We record the pointer-down position and compare it against pointer-up.
  // The threshold is 4 CSS pixels (squared: 16) — small enough to ignore
  // micro-jitter from a resting hand, large enough to never fire during
  // an intentional drag.
  //
  // WHY SQUARED DISTANCE? Comparing dx²+dy² against 16 avoids calling
  // Math.sqrt — the magnitude check becomes a single multiply-add-compare,
  // which is cheaper and numerically identical in result.
  let downX = 0; // client-space X at pointerdown
  let downY = 0; // client-space Y at pointerdown

  /** Squared pixel distance between pointerdown and pointerup. */
  const CLICK_THRESHOLD_SQ = 4 * 4; // 4 px radius → 16 when squared

  // The orbit-drag rate's ground-tracking denominator needs the focused body's
  // radius — read live through the caller's getter rather than cached, since
  // this module never sees the scene and focus can change while controls stay
  // attached.
  const pivotRadius = (): number | null => options?.pivotRadiusMpc?.() ?? null;

  // The pan and orbit-drag-rate sites below need EYE-based altitude, not
  // `distance − pivotRadius` — see `OrbitControlsOptions.pivotAltitudeMpc`'s
  // docblock. Same live-getter shape as `pivotRadius` above.
  const pivotAltitude = (): number | null => options?.pivotAltitudeMpc?.() ?? null;

  // ── Pointer down — begin drag ──────────────────────────────────────────────

  const onDown = (e: PointerEvent) => {
    // A mouse is strictly single-pointer, so a fresh mouse-down always
    // begins a new gesture — it can never be the second finger of a
    // pinch.  Clearing here heals state stranded by a `pointerup` we
    // never saw: without pointer capture (removed for the iOS fix), a
    // button released *outside* the viewport fires no `window`
    // pointerup, which would otherwise leave a stale entry that promotes
    // the next click to a bogus two-pointer 'pinch'.  Touch pointers are
    // left untouched — their up/cancel reliably reach the window
    // listeners via implicit capture.
    if (e.pointerType === 'mouse') {
      activePointers.clear();
      dragMode = null;
      dragPointerId = null;
      lastPinchDist = 0;
    }

    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 1) {
      // First contact — pick the appropriate single-pointer mode.
      //   - mouse button 1 / 2 (middle / right) → pan
      //   - everything else (mouse left, touch, pen) → orbit
      // Touch + pen never report buttons 1 / 2, so they always fall into
      // orbit here.  Pinch is set later if a second contact arrives.
      if (e.pointerType === 'mouse' && (e.button === 1 || e.button === 2)) {
        dragMode = 'pan';
      } else if (e.shiftKey) {
        // Shift is sampled ONCE, here: a modifier released mid-drag must not
        // swap the gesture's currency out from under the hand.
        // delete when the globe-anchored camera pivot replaces surface navigation
        dragMode = 'tilt';
      } else {
        dragMode = 'orbit';
      }
      dragPointerId = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      // Record the exact down position for click detection.
      downX = e.clientX;
      downY = e.clientY;

      // Capture the drag-grab point (spec §4.4) — whatever the cursor was
      // last hovering when this gesture began. `null` when nothing has ever
      // hit (or the getter is absent), which the orbit branch reads as "use
      // the flat-rate fallback".
      grabbedPoint = options?.hoveredSurfacePoint?.() ?? null;
      exactSolveLatchedOff = false;

      // Notify the engine that a new gesture is starting. The engine uses this
      // to seed the drag register from the live produced pose (so a mid-tween
      // grab continues from where the animation left the camera, not from a
      // stale register) and to dispatch beginDrag() + cancelCameraTween().
      // Only fires on the FIRST contact — a second finger promoting to pinch
      // does NOT re-fire gesture-start.
      options?.onGestureStart?.();

      // No `setPointerCapture` here — see the module header. The move /
      // up / cancel listeners live on `window`, so a drag keeps tracking
      // outside the canvas without capture, and we sidestep the WebKit
      // explicit-capture bug that silently kills touch gestures on iOS.
    } else if (activePointers.size === 2) {
      // Second contact — promote the gesture to pinch and record the
      // baseline distance.  Subsequent moves on either pointer will
      // recompute the distance and scale `cam.distance` by the ratio.
      // `dragPointerId` is left intact so we can still see the
      // single-pointer driver, but `dragMode === 'pinch'` short-circuits
      // the orbit/pan branch in `onMove`.
      dragMode = 'pinch';
      lastPinchDist = currentPinchDistance();
    }
    // 3+ pointers: tracked in the map so they're consumed cleanly on
    // pointerup, but they don't change `dragMode` — pinch stays a
    // two-finger gesture.

    // Notify the engine so it can wake the render loop — any subsequent
    // pointermove will fire the same callback.  Calling here too means
    // the click→hover-clear path also gets a frame.
    options?.onChange?.();
    emitDebugSample();
  };

  // ── Pointer up — end drag (or click) ──────────────────────────────────────

  const onUp = (e: PointerEvent) => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.delete(e.pointerId);

    // No capture to release — we never call setPointerCapture (see the
    // module header). Implicit touch capture auto-releases on pointerup.

    if (activePointers.size === 0) {
      // All contacts lifted — close out the gesture.
      const endedMode = dragMode;
      dragMode = null;
      dragPointerId = null;
      lastPinchDist = 0;
      grabbedPoint = null;

      // ── Click detection ──────────────────────────────────────────────
      // If the pointer barely moved between down and up, treat this as a
      // click rather than a drag.  Only fires for ORBIT releases:
      //   - pan releases (right/middle mouse) shouldn't pick a galaxy
      //   - pinch releases obviously aren't a tap
      // Without this gate, a flicker of the right mouse — or the second
      // finger going up after a pinch — would clear the user's selection.
      if (options?.onClick && endedMode === 'orbit') {
        const dx = e.clientX - downX;
        const dy = e.clientY - downY;
        if (dx * dx + dy * dy < CLICK_THRESHOLD_SQ) {
          options.onClick(e.clientX, e.clientY);
        }
      }

      // All contacts lifted — commit the gesture's final pose to the Redux
      // store and end the drag. This fires AFTER click detection so a click
      // still resolves before the gesture-end commit (order is harmless
      // either way; the click callback and the gesture-end dispatch are
      // independent). The engine dispatches commitCameraPose THEN endDrag so
      // the baked pose is in `base` before the orbitDrag driver deactivates.
      options?.onGestureEnd?.();
    } else if (dragMode === 'pinch') {
      // Pinch broken (one finger lifted, one or more still down) — end
      // the gesture entirely.  We deliberately do NOT promote the
      // remaining finger back into orbit mode: that would feel like the
      // camera "snaps" when the user lifts a finger to readjust grip.
      // The user has to lift everything and re-engage to start a new
      // gesture, which keeps gesture boundaries clean.
      dragMode = null;
      dragPointerId = null;
      lastPinchDist = 0;
    }
    emitDebugSample();
  };

  // ── Pointer move — update orbit ────────────────────────────────────────────

  // ── Reusable scratch vectors for the pan path ────────────────────────────
  //
  // Allocated once at attach time and reused on every pointermove so the
  // hot-path doesn't allocate.  vec3.subtract / vec3.normalize / vec3.scale all
  // accept the `dst` as an optional LAST arg; we pass these scratches in as
  // that destination to keep GC pressure at zero during a continuous drag.
  // `imagePlaneBasis` writes its result into `basisScratch` for the same reason.
  const forwardScratch: Vec3 = [0, 0, 0];
  const basisScratch: ImagePlaneBasis = { rolledUp: [0, 0, 0], right: [0, 0, 0], up: [0, 0, 0] };
  const panDeltaScratch = vec3.create();
  const upRefScratch: Vec3 = [0, 0, 0];

  const onMove = (e: PointerEvent) => {
    // Update the live position of whichever pointer this move belongs to.
    // `pointermove` fires for ALL active pointers, not just the one
    // driving an orbit — so we always update the map first, then decide
    // what to do with the gesture as a whole.
    const ptr = activePointers.get(e.pointerId);
    if (!ptr) return;
    ptr.x = e.clientX;
    ptr.y = e.clientY;

    if (dragMode === 'pinch') {
      // ── Pinch — multi-touch zoom ────────────────────────────────────
      //
      // Use the ratio of last-distance to current-distance to scale the zoom
      // exponentially.  Pinch OUT (fingers move apart) grows current distance
      // → ratio < 1 → camera distance shrinks → zoom IN.  Pinch IN does the
      // inverse.  This matches the "grab the world and stretch" mental model
      // that mobile users expect. Raw pixel ratio is naturally calibrated to
      // the user's hand, so no separate sensitivity tuning.
      //
      // The pinch MIDPOINT is the gesture's cursor: `onZoom` anchors the zoom
      // on whatever surface point sits under it, exactly as the wheel anchors
      // on the pointer.
      if (activePointers.size < 2 || lastPinchDist === 0) return;
      const newDist = currentPinchDistance();
      if (newDist > 0) {
        options?.onZoom?.(lastPinchDist / newDist, currentPinchMidpointCss());
        lastPinchDist = newDist;
      }
      return;
    }

    if (dragMode === null) return;

    // Orbit / pan: only the original gesture-driver pointer mutates the
    // camera.  Other contacts (e.g. a stray third finger) are tracked
    // for clean teardown but ignored here.  Without this guard, a
    // second finger entering the canvas would yank `lastX`/`lastY`
    // around between the two fingers and the orbit would jitter.
    if (e.pointerId !== dragPointerId) return;

    // Delta in CSS pixels from the last recorded position.
    // We use client coordinates (viewport-relative) rather than offset
    // coordinates (element-relative) so the delta is stable even when the
    // canvas is scrolled, transformed, or when capture routes events from
    // outside the element.
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    if (dragMode === 'tilt') {
      // ── Tilt PROBE (shift + drag) ───────────────────────────────────────
      //
      // delete when the globe-anchored camera pivot replaces surface navigation
      //
      // The EYE is held and the PIVOT swings: rotate the aim toward screen-up
      // by the clamped tilt delta, then re-place the target at the same range
      // along the new aim, so `updatePosition` puts the eye back exactly where
      // it was. The pivot move is the frame's own channel — `accumulateFollowPan`
      // diffs `cam.target` during an orbit drag, so the pin keeps the tilt. Past
      // the horizon that pivot is a point in the SKY, which the pin carries
      // fine; what it costs is listed in `surfaceTiltAngle`'s header.
      // Horizontal motion is ignored: heading would need its own machinery.
      const frame = options?.dragPivotFrame?.() ?? null;
      if (frame === null || dy === 0) return;

      vec3.subtract(cam.target, cam.position, forwardScratch);
      vec3.normalize(forwardScratch, forwardScratch);
      const basis = imagePlaneBasis(
        forwardScratch,
        cam.roll ?? 0,
        frameUp(cam.upBasis, upRefScratch),
        basisScratch,
      );
      const nx = frame.bodyCentreMpc[0] - cam.position[0];
      const ny = frame.bodyCentreMpc[1] - cam.position[1];
      const nz = frame.bodyCentreMpc[2] - cam.position[2];
      const nlen = Math.hypot(nx, ny, nz) || 1;
      const cosTilt =
        (forwardScratch[0] * nx + forwardScratch[1] * ny + forwardScratch[2] * nz) / nlen;
      const current = Math.acos(Math.max(-1, Math.min(1, cosTilt)));
      const next = surfaceTiltAngle(current, dy);
      const delta = next - current;
      if (delta === 0) return;

      const c = Math.cos(delta);
      const s = Math.sin(delta);
      const aim: Vec3 = [
        forwardScratch[0] * c + basis.up[0] * s,
        forwardScratch[1] * c + basis.up[1] * s,
        forwardScratch[2] * c + basis.up[2] * s,
      ];
      // The REAL ceiling on how far up the view swings, and it depends on where
      // you stand: the aim reaches the frame pole at π/2 + frame latitude, and
      // the whole screen basis is `aim × upRef`, which REVERSES as it crosses —
      // the tilt then walks backwards and the horizon flips end over end.
      // `PITCH_LIMIT` alone stops a degree short of that, deep inside the zone
      // where it is already unusable; 0.1 rad (5.7°) is measured to be clear.
      const poleDot =
        aim[0] * upRefScratch[0] + aim[1] * upRefScratch[1] + aim[2] * upRefScratch[2];
      if (Math.abs(poleDot) > Math.cos(0.1)) return;

      const angles = orbitAnglesLookingAlong(aim, cam.poseBasis);
      // Refused, not clamped — the rule the drag solve follows.
      if (Math.abs(angles.pitch) > PITCH_LIMIT) return;

      cam.target[0] = cam.position[0] + aim[0] * cam.distance;
      cam.target[1] = cam.position[1] + aim[1] * cam.distance;
      cam.target[2] = cam.position[2] + aim[2] * cam.distance;
      cam.yaw = angles.yaw;
      cam.pitch = angles.pitch;
      updatePosition(cam);
      options?.onChange?.();
      return;
    }

    if (dragMode === 'pan') {
      // ── Pan (right / middle button drag) ────────────────────────────────
      //
      // Goal: the world point under the cursor should appear to follow the
      // cursor as the user drags.  We do NOT reproject the picked-pixel into
      // world space (which would be the most accurate but requires the
      // depth buffer); instead we approximate by translating the camera
      // target along the camera's right + up axes by a screen-aligned
      // amount.
      //
      // Step 1: derive camera basis vectors.  `forward` is the unit vector
      // from camera position toward the target — that's the negative of
      // (position − target).  `imagePlaneBasis` turns it into the screen
      // `right` axis (`forward × up`, the side-axis of the screen plane) and
      // the orthonormal `up` axis (`right × forward`, recomputed orthogonal
      // to forward + right rather than blindly using world-up, so it handles
      // tilt cases correctly when pitch is non-zero). Roll is 0 here; the
      // reference up is the frame pole (`frameUp(cam.upBasis)`; world +Y
      // absent a basis), so the drag pan tracks whichever frame is active.
      vec3.subtract(cam.target, cam.position, forwardScratch);
      vec3.normalize(forwardScratch, forwardScratch);
      const basis = imagePlaneBasis(
        forwardScratch,
        0,
        frameUp(cam.upBasis, upRefScratch),
        basisScratch,
      );

      // Step 2: convert pixel delta → world delta at the camera's focal
      // distance.  At the target depth, one CSS pixel maps to
      //   2 · cam.distance · tan(fovY/2) / canvasHeight
      // world units along screen-up; the same factor applies to screen-right
      // because pixels are square.  Using clientHeight (CSS pixels) rather
      // than canvas.height (backing-store pixels) keeps the gesture's
      // physical-feel consistent regardless of devicePixelRatio. Near a
      // focused pivot, `cam.distance` is replaced by the EYE-based altitude
      // (`pivotAltitude()`) — see `OrbitControlsOptions.pivotAltitudeMpc`.
      const cssHeight = canvas.clientHeight || 1;
      const pxToWorld =
        (2 * (pivotAltitude() ?? cam.distance) * Math.tan(cam.fovYRad / 2)) / cssHeight;

      // Step 3: build the world-space translation.
      //   - dragging RIGHT  (+dx CSS) → world point should slide RIGHT  →
      //     camera target slides LEFT  (along -right):    -dx · right
      //   - dragging DOWN   (+dy CSS) → world point should slide DOWN   →
      //     camera target slides UP    (along +cam_up):   +dy · cam_up
      // (CSS y grows downward; cam_up points toward +screen-up, which is
      // the OPPOSITE of CSS y, so the +dy → +cam_up sign falls out
      // naturally without an extra flip.)
      vec3.scale(basis.right, -dx * pxToWorld, panDeltaScratch);
      vec3.addScaled(panDeltaScratch, basis.up, dy * pxToWorld, panDeltaScratch);

      // Step 4: shift the target.  Camera.position is recomputed from
      // target + dir(yaw, pitch) · distance inside updatePosition, so we
      // only mutate target — the orbit framing stays intact.
      vec3.add(cam.target, panDeltaScratch, cam.target);
      updatePosition(cam);
      options?.onChange?.();
      return;
    }

    // ── Orbit (left button drag) ──────────────────────────────────────────
    //
    // Hit branch (spec §4.4): a body-surface point was grabbed at gesture
    // start and it's still on the currently focused body (focus can change
    // mid-drag) — solve the EXACT (yaw, pitch) that keeps that point under
    // THIS tick's cursor, rather than the flat rate below (which
    // `orbitRadPerPixel`'s header documents as correct only at screen
    // centre). `dragPivotFrame` is read fresh every move, not cached from
    // gesture start, so a body that itself orbits between ticks is handled
    // correctly by construction.
    if (grabbedPoint !== null && !exactSolveLatchedOff) {
      const frame = options?.dragPivotFrame?.() ?? null;
      if (frame !== null && frame.bodyId === grabbedPoint.bodyId) {
        // The eye the solve measures from must be the one on SCREEN. For a
        // pivot-pinned focus the frame loop SETS `target = body centre +
        // followPanWorld(...)` every frame, so the drag register's `target` is
        // frozen at gesture start — a mid-drag zoom's lateral and the body's
        // own motion both land in the offset and nowhere else. Read-side
        // only: the register's target keeps `accumulateFollowPan`'s write
        // semantics untouched.
        const solveCam =
          frame.pinnedTargetMpc === null ? cam : { ...cam, target: frame.pinnedTargetMpc };
        // Screen basis: `cam.roll` / `frameUp(cam.upBasis)`, mirroring the
        // pan branch's reads above — this is the basis `computeViewProj`
        // actually renders with, NOT `poseBasis` (which only decodes where
        // the eye sits). Reusing `upRefScratch` is safe: orbit and pan never
        // run in the same `onMove` call.
        const solved = surfaceDragRotation(
          grabbedPoint.point,
          frame.bodyOrientation,
          frame.bodyCentreMpc,
          frame.radiusMpc,
          solveCam,
          cam.roll ?? 0,
          frameUp(cam.upBasis, upRefScratch),
          cam.fovYRad,
          cam.aspect,
          { width: canvas.clientWidth, height: canvas.clientHeight },
          { x: e.clientX, y: e.clientY },
          Math.hypot(dx, dy),
        );
        if (solved !== null) {
          cam.yaw = solved.yaw;
          // Final safety on whichever path won — the solve already refuses a
          // solution past the limit rather than clamping one (see
          // `surfaceDragRotation`'s `accept`).
          cam.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, solved.pitch));
          updatePosition(cam);
          options?.onChange?.();
          return;
        }
        // Declined — degenerate, non-convergent, or a step this event could
        // not plausibly want. Fall through to the flat rate, and stay there
        // for the rest of the gesture.
        exactSolveLatchedOff = true;
      }
    }

    // Miss branch — no grab captured, the grabbed body is no longer focused,
    // or the exact solve didn't converge: the pre-existing flat,
    // altitude-damped rate, unchanged.
    //
    // Yaw (left / right): we *subtract* dx so that dragging right (positive
    // dx) decreases yaw, rotating the camera to the left around the scene —
    // equivalent to "grabbing the world and pulling it right". This matches
    // the intuitive globe-drag metaphor:  your hand moves right, the world
    // rotates right.
    //
    // If we added dx instead, drag-right would swing the camera rightward,
    // which feels like an FPS look — counter-intuitive for an orbiting view.
    //
    // Sensitivity: `orbitRadPerPixel` damps the flat rate by altitude above a
    // focused body's surface so the ground under the cursor tracks the drag
    // (see the util's module header for the derivation and its limits).
    const cssHeight = canvas.clientHeight || 1;
    const radPerPixel = orbitRadPerPixel(cam.fovYRad, pivotAltitude(), cssHeight, pivotRadius());

    cam.yaw -= dx * radPerPixel;

    // Pitch (up / down): dragging down (positive dy, because CSS Y grows
    // downward) should tilt the camera upward toward the +Y pole — so we
    // *add* dy to pitch.  Clamp to ±PITCH_LIMIT to prevent the gimbal-lock
    // singularity at ±π/2 (see PITCH_LIMIT comment above). Same altitude-damped
    // rate as yaw.
    cam.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, cam.pitch + dy * radPerPixel));

    // Recalculate cam.position from the updated yaw/pitch/distance.
    // The render loop reads cam.position (via computeViewProj) on the next
    // requestAnimationFrame tick, so this mutation is effectively immediate.
    updatePosition(cam);
    options?.onChange?.();
  };

  // ── Wheel — zoom ───────────────────────────────────────────────────────────

  const onWheel = (e: WheelEvent) => {
    // Stop the page from scrolling while the user zooms the 3D view.
    // This requires `{ passive: false }` on the listener (see below) because
    // passive listeners cannot call `preventDefault()`.
    e.preventDefault();

    // Exponential zoom: scale by e^(δ · k) per notch.
    //
    // Why exponential (multiplicative) rather than linear (additive)?
    //
    //   • Linear (+/−Δ per tick) feels fast when you're close (distance=0.1)
    //     and sluggish when you're far (distance=1000).
    //   • Exponential (×factor per tick) gives the same *proportional* step
    //     regardless of the current distance — zooming in by 10% always looks
    //     the same on screen, whether you're near or far.
    //
    // `Math.exp(deltaY * 0.001)`:
    //   • `deltaY` is typically ±100 (one notch) on desktop mice with the
    //     default "pixel" delta mode, or ±3–4 on high-resolution trackpads.
    //   • k = 0.001 maps one notch (100 units) to e^0.1 ≈ 1.105 — about
    //     10 % per notch. This is a comfortable zoom speed. Larger k zooms
    //     faster; smaller k is more precise.
    //   • Scroll down (positive deltaY) → factor > 1 → distance grows (zoom out).
    //   • Scroll up   (negative deltaY) → factor < 1 → distance shrinks (zoom in).
    //
    // The factor is a proportion of the eye's distance to whatever the cursor
    // is over, not of raw distance to the orbit centre — see `cursorZoomStep`,
    // which the engine applies on the other side of `onZoom`. This module
    // deliberately owns none of that: the geometry it would need (body centre,
    // radius, the pose actually on screen) all lives engine-side.
    const factor = Math.exp(e.deltaY * 0.001);

    // Inherited-momentum guard: while a drag is active, only apply a wheel
    // tick whose gesture STARTED during this drag. A momentum stream that
    // was already coasting before the drag began must not fold into it —
    // see fw-c-brief.md. A deliberate scroll begun mid-drag still works:
    // its first tick has a big gap since the prior tick, so it reads as a
    // new gesture and `wheelGestureStartedMidDrag` becomes true right here.
    const now = performance.now();
    if (now - wheelGestureTickTs > WHEEL_GESTURE_GAP_MS) {
      wheelGestureStartedMidDrag = dragMode !== null;
    }
    wheelGestureTickTs = now;
    const dropped = dragMode !== null && !wheelGestureStartedMidDrag;

    lastWheelDeltaY = e.deltaY;
    lastWheelAtMs = now;
    lastWheelDropped = dropped;
    emitDebugSample();

    if (dropped) return;

    options?.onZoom?.(factor, { x: e.clientX, y: e.clientY });
  };

  // ── Register listeners ─────────────────────────────────────────────────────

  // `pointerdown` on the canvas — a drag only starts when the gesture
  // begins on the drawing surface. The continuation events go on `window`
  // (see the module header: drag-outside continuation + the iOS WebKit
  // explicit-capture bug).
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointermove', onMove);
  // `pointercancel` fires when the system pre-empts the gesture (notification
  // shade, phone call, OS gesture-shelf swipe, low-memory pause).  It carries
  // no end coordinate worth using for click detection, so we route it through
  // the same teardown path as `pointerup` — the click branch will simply not
  // fire because the cancelled pointer's recorded down/up positions don't
  // reflect a real tap intent.
  window.addEventListener('pointercancel', onUp);

  // ── Double-click — delegate to the browser's `dblclick` event ────────────
  //
  // We don't track timing ourselves: the browser already implements the OS
  // double-click threshold (typically 300–500 ms, configurable in the user's
  // accessibility settings).  On touch screens the same event also fires for
  // a quick double-tap, so this single listener covers desktop + mobile.
  const onDblClick = (e: MouseEvent) => {
    options?.onDoubleClick?.(e.clientX, e.clientY);
  };
  canvas.addEventListener('dblclick', onDblClick);

  // ── Suppress the right-click context menu on the canvas ──────────────────
  //
  // The pan gesture uses the right mouse button (and middle), so a normal
  // right-click would otherwise trigger the browser's context menu and cancel
  // the drag.  We listen on the canvas only so the user can still right-click
  // anywhere ELSE on the page (settings panel, info card link, etc.).
  const onContextMenu = (e: Event) => e.preventDefault();
  canvas.addEventListener('contextmenu', onContextMenu);

  // `{ passive: false }` is required for wheel events in modern browsers.
  //
  // Background: browsers optimise scrolling by treating wheel listeners as
  // "passive" by default — they assume the handler will NOT call
  // `preventDefault()` and scroll the page immediately on a separate thread
  // without waiting for JavaScript. This gives buttery-smooth native scroll.
  //
  // Opting out (`passive: false`) tells the browser we *might* call
  // `preventDefault()`, so it must wait for our handler to finish before
  // deciding whether to scroll. This adds a small latency to scrolling
  // elsewhere on the page, but it's the only way to suppress page scroll
  // while the user is zooming the canvas.
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // ── Return teardown function ───────────────────────────────────────────────

  // Returning a cleanup function is the standard "disposable" pattern in
  // JavaScript. It mirrors React's `useEffect` cleanup, Svelte's `onDestroy`,
  // and the raw `addEventListener` / `removeEventListener` contract.
  //
  // By capturing the exact same handler references in a closure, we guarantee
  // that `removeEventListener` matches the original registrations —
  // a different function object (even with identical body) would not match.
  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('dblclick', onDblClick);
    canvas.removeEventListener('contextmenu', onContextMenu);
    canvas.removeEventListener('wheel', onWheel);
  };
}
