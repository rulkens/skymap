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

import type { OrbitCamera } from '../@types';
import { updatePosition } from './orbitCamera';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Optional configuration for `attachOrbitControls`.
 *
 * All fields are optional — omitting the object entirely gives the same
 * behaviour as the original single-argument overload (orbit only, no click).
 */
export type OrbitControlsOptions = {
  /**
   * Called when the user clicks (as opposed to drags) on the canvas.
   *
   * A "click" is defined as a pointerup that occurred within 4 CSS pixels of
   * the corresponding pointerdown. This threshold distinguishes intentional
   * taps from the tiny pointer jitter that always precedes a drag start.
   *
   * Coordinates are in CSS pixels (matching `e.clientX` / `e.clientY`), so
   * the caller can pass them directly to pick-coordinate conversion without
   * any additional scaling.
   *
   * @param xCss  Horizontal CSS pixel position of the click.
   * @param yCss  Vertical CSS pixel position of the click.
   */
  onClick?: (xCss: number, yCss: number) => void;
};

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Maximum allowed pitch angle in radians — clamped just below π/2 (90°).
 *
 * ### Why not exactly π/2?
 *
 * At pitch = ±π/2 the camera sits exactly on the world's +Y or −Y pole.
 * At that point the camera's "forward" direction (toward the target) is
 * perfectly aligned with the world "up" vector `[0, 1, 0]` used by `lookAt`.
 * When forward and up are collinear, `lookAt` cannot determine a unique
 * "right" axis: the cross product of two parallel vectors is the zero vector.
 * The result is a degenerate (all-NaN) view matrix — this is the **gimbal
 * lock** singularity. Every orbit camera must guard against it.
 *
 * Subtracting a small ε (0.01 rad ≈ 0.57°) keeps the camera safely off the
 * poles so `lookAt` always has a well-defined "up" direction. The user will
 * never notice the 0.57° gap.
 *
 * See also: the ⚠ note in `orbitCamera.ts` on `OrbitCameraInit.pitch`.
 */
const PITCH_LIMIT = Math.PI / 2 - 0.01;

// ─── Controls ─────────────────────────────────────────────────────────────────

/**
 * Attach mouse/touch/pen orbit controls to a canvas element.
 *
 * Registers four event listeners on `canvas`:
 *
 *   - `pointerdown`  — start a drag, capture pointer
 *   - `pointerup`    — end a drag, release pointer
 *   - `pointermove`  — update yaw/pitch while dragging
 *   - `wheel`        — zoom in/out by changing `cam.distance`
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
 * @param options  Optional configuration. Currently supports `onClick`, a
 *                 callback fired when the user taps without dragging.
 * @returns A teardown function — call it to remove all event listeners.
 */
export function attachOrbitControls(
  canvas: HTMLCanvasElement,
  cam: OrbitCamera,
  options?: OrbitControlsOptions,
): () => void {
  // Track drag state with module-level (closure) variables so the three
  // pointer handlers can share it without a wrapper object allocation.
  let dragging = false;
  let lastX = 0; // client-space X of the previous pointermove event
  let lastY = 0; // client-space Y of the previous pointermove event

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

  // ── Pointer down — begin drag ──────────────────────────────────────────────

  const onDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;

    // Record the exact down position for click detection.
    downX = e.clientX;
    downY = e.clientY;

    // `setPointerCapture` tells the browser to route all future pointer events
    // for this pointer ID to `canvas`, even when the cursor strays outside its
    // bounding box or leaves the browser window entirely.
    //
    // Without capture, `pointermove` events stop arriving the moment the user
    // drags outside the canvas — the orbit snaps to a halt mid-drag. With
    // capture, the drag continues smoothly until the user releases, no matter
    // how far outside the element the cursor goes.
    //
    // The pointer ID (`e.pointerId`) is a unique integer assigned by the
    // browser per active contact point (finger, pen tip, or mouse button).
    // Passing it back in `releasePointerCapture` targets the exact same contact.
    canvas.setPointerCapture(e.pointerId);
  };

  // ── Pointer up — end drag (or click) ──────────────────────────────────────

  const onUp = (e: PointerEvent) => {
    dragging = false;

    // Release capture so the pointer is no longer "owned" by this canvas.
    // The browser automatically releases capture on pointerup in most cases,
    // but calling it explicitly is defensive and makes intent clear.
    canvas.releasePointerCapture(e.pointerId);

    // ── Click detection ────────────────────────────────────────────────────
    //
    // If the pointer barely moved between down and up, treat this as a click
    // rather than a drag. We check squared distance to avoid sqrt.
    //
    // This fires only when `options.onClick` is provided — no cost for callers
    // that don't need click detection.
    if (options?.onClick) {
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      if (dx * dx + dy * dy < CLICK_THRESHOLD_SQ) {
        options.onClick(e.clientX, e.clientY);
      }
    }
  };

  // ── Pointer move — update orbit ────────────────────────────────────────────

  const onMove = (e: PointerEvent) => {
    if (!dragging) return;

    // Delta in CSS pixels from the last recorded position.
    // We use client coordinates (viewport-relative) rather than offset
    // coordinates (element-relative) so the delta is stable even when the
    // canvas is scrolled, transformed, or when capture routes events from
    // outside the element.
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    // ── Yaw (left / right) ───────────────────────────────────────────────
    //
    // We *subtract* dx so that dragging right (positive dx) decreases yaw,
    // rotating the camera to the left around the scene — equivalent to
    // "grabbing the world and pulling it right". This matches the intuitive
    // globe-drag metaphor:  your hand moves right, the world rotates right.
    //
    // If we added dx instead, drag-right would swing the camera rightward,
    // which feels like an FPS look — counter-intuitive for an orbiting view.
    //
    // Sensitivity: 0.005 rad/px means a 100 px drag sweeps ~28.6°, which
    // covers roughly 1/12 of a full orbit. This feels natural on a typical
    // laptop trackpad — fast enough to reorient in a few gestures, slow
    // enough for precise positioning. Exposing this as a tunable constant
    // (rather than deriving it from fov or canvas size) keeps the feel
    // consistent regardless of resolution or zoom level.
    cam.yaw -= dx * 0.005;

    // ── Pitch (up / down) ────────────────────────────────────────────────
    //
    // Dragging down (positive dy, because CSS Y grows downward) should tilt
    // the camera upward toward the +Y pole — so we *add* dy to pitch.
    //
    // We clamp the result to ±PITCH_LIMIT to prevent the gimbal-lock
    // singularity at ±π/2 (see PITCH_LIMIT comment above).
    cam.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, cam.pitch + dy * 0.005));

    // Recalculate cam.position from the updated yaw/pitch/distance.
    // The render loop reads cam.position (via computeViewProj) on the next
    // requestAnimationFrame tick, so this mutation is effectively immediate.
    updatePosition(cam);
  };

  // ── Wheel — zoom ───────────────────────────────────────────────────────────

  const onWheel = (e: WheelEvent) => {
    // Stop the page from scrolling while the user zooms the 3D view.
    // This requires `{ passive: false }` on the listener (see below) because
    // passive listeners cannot call `preventDefault()`.
    e.preventDefault();

    // Exponential zoom: multiply distance by e^(δ · k).
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
    // `Math.max(0.01, …)` prevents distance from reaching zero or going
    // negative, which would flip the camera through the target and produce
    // an inverted scene.
    const factor = Math.exp(e.deltaY * 0.001);
    cam.distance = Math.max(0.01, cam.distance * factor);
    updatePosition(cam);
  };

  // ── Register listeners ─────────────────────────────────────────────────────

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointermove', onMove);

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
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('wheel', onWheel);
  };
}
