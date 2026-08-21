/**
 * orbitControls — unit tests for the canvas → OrbitCamera input mapping,
 * focused on the listener-target contract that keeps touch gestures
 * working on iOS Safari, and the gesture-hook callbacks that wire the
 * drag state into the Redux camera slice.
 *
 * ### Why this test exists
 *
 * iOS Safari (WebKit) mishandles an *explicit* `setPointerCapture()` on a
 * touch pointer: touch already gets *implicit* capture on `pointerdown`,
 * and layering an explicit capture on top makes WebKit stop delivering
 * `pointermove` / `pointerup` — so single-finger orbit and two-finger
 * pinch both die, while mouse (no implicit capture) is unaffected.  See
 * https://github.com/openseadragon/openseadragon/issues/1962.
 *
 * The fix is the reference pattern used by every major touch-gesture lib:
 * do NOT call `setPointerCapture`; instead bind the *move* / *up* /
 * *cancel* listeners to `window` so they fire regardless of WebKit's
 * broken capture and regardless of where the pointer travels.  These
 * tests lock that contract in:
 *
 *   1. `pointerdown` is on the canvas (a gesture must start on it), but
 *      `pointermove` / `pointerup` / `pointercancel` are on `window`.
 *   2. `setPointerCapture` is never called.
 *   3. An orbit driven by a `window` pointermove actually mutates yaw —
 *      i.e. the drag works through the window listener path.
 *
 * ### Gesture hook tests
 *
 * The new `onGestureStart` / `onGestureEnd` / `onChange` callbacks let
 * wireInput.ts wire the Redux camera slice without subclassing or patching
 * the controls. Tests pin:
 *
 *   - `onGestureStart` fires exactly on the FIRST contact (not on a
 *     second finger promoting to pinch).
 *   - `onGestureEnd` fires exactly when ALL contacts are lifted.
 *   - `onChange` fires after any orbit or pan change; every zoom tick (wheel
 *     notch or pinch step) goes out through `onZoom` with its anchor cursor,
 *     since the engine — not this module — owns zoom.
 *
 * Vitest runs in `node` here (no jsdom), so — matching
 * `inputBindings.test.ts` — we hand-roll EventTarget recorders for the
 * canvas and a stubbed `window`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { attachOrbitControls } from '../../../src/services/camera/orbitControls';
import { createOrbitCamera } from '../../../src/utils/camera/createOrbitCamera';
import { updatePosition } from '../../../src/utils/camera/updatePosition';
import { orbitRadPerPixel } from '../../../src/utils/camera/orbitRadPerPixel';
import { cursorRayWorld } from '../../../src/utils/camera/cursorRayWorld';
import { cursorSurfaceHit } from '../../../src/utils/camera/cursorSurfaceHit';
import { IDENTITY_MAT3 } from '../../../src/utils/math/identityMat3';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { OrbitCamera } from '../../../src/@types/camera/OrbitCamera';
import type { BodyId } from '../../../src/@types/data/body/BodyId';
import type { Vec3 } from '../../../src/@types/math/Vec3';

/** Earth's mean radius (km → Mpc) — the pivot radius for the zoom-floor cases. */
const EARTH_RADIUS_MPC = 6371 * SCALE_UNITS.KM_TO_MPC;

type Listener = (e: unknown) => void;

function makeRecorder() {
  const listeners: Array<{ type: string; handler: Listener }> = [];
  const target = {
    addEventListener(type: string, handler: Listener): void {
      listeners.push({ type, handler });
    },
    removeEventListener(type: string, handler: Listener): void {
      const idx = listeners.findIndex((l) => l.type === type && l.handler === handler);
      if (idx >= 0) listeners.splice(idx, 1);
    },
  };
  function fire(type: string, event: unknown): void {
    for (const l of [...listeners]) {
      if (l.type === type) l.handler(event);
    }
  }
  function has(type: string): boolean {
    return listeners.some((l) => l.type === type);
  }
  return { target, listeners, fire, has };
}

/**
 * Canvas stand-in: a recorder plus the pointer-capture methods the
 * module *might* call.  `setPointerCapture` is a spy so tests can assert
 * it stays untouched.  `clientHeight` feeds the pan path's px→world
 * conversion (unused by the orbit tests but needed for a valid shape).
 */
function makeCanvas() {
  const rec = makeRecorder();
  const setPointerCapture = vi.fn();
  const releasePointerCapture = vi.fn();
  const canvas = Object.assign(rec.target, {
    setPointerCapture,
    releasePointerCapture,
    hasPointerCapture: () => false,
    clientHeight: 1000,
    clientWidth: 1000,
    width: 1000,
    height: 1000,
  });
  return { canvas, rec, setPointerCapture, releasePointerCapture };
}

function makeCamera(distance = 100): OrbitCamera {
  return createOrbitCamera({
    target: [0, 0, 0],
    distance,
    yaw: 0,
    pitch: 0,
    fovYRad: (Math.PI / 180) * 60,
    aspect: 1,
    near: 0.1,
    far: 1000,
  });
}

let win: ReturnType<typeof makeRecorder>;
let originalWindow: unknown;

beforeEach(() => {
  win = makeRecorder();
  const g = globalThis as unknown as Record<string, unknown>;
  originalWindow = g.window;
  g.window = win.target;
});

afterEach(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  if (originalWindow === undefined) {
    delete g.window;
  } else {
    g.window = originalWindow;
  }
});

describe('attachOrbitControls — listener targets (iOS touch capture fix)', () => {
  it('binds pointerdown to the canvas but move/up/cancel to window', () => {
    const { canvas, rec } = makeCanvas();
    attachOrbitControls(canvas as unknown as HTMLCanvasElement, makeCamera());

    // Gesture start stays on the canvas — only touches that begin on the
    // drawing surface should start an orbit.
    expect(rec.has('pointerdown')).toBe(true);

    // The continuation/teardown events live on window so WebKit's broken
    // touch capture can't strand them.
    expect(rec.has('pointermove')).toBe(false);
    expect(rec.has('pointerup')).toBe(false);
    expect(rec.has('pointercancel')).toBe(false);
    expect(win.has('pointermove')).toBe(true);
    expect(win.has('pointerup')).toBe(true);
    expect(win.has('pointercancel')).toBe(true);
  });

  it('never calls setPointerCapture (relies on implicit/window delivery)', () => {
    const { canvas, rec, setPointerCapture } = makeCanvas();
    attachOrbitControls(canvas as unknown as HTMLCanvasElement, makeCamera());

    rec.fire('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      button: 0,
      clientX: 100,
      clientY: 100,
    });

    expect(setPointerCapture).not.toHaveBeenCalled();
  });

  it('orbits from a window-dispatched pointermove after a canvas pointerdown', () => {
    const { canvas, rec } = makeCanvas();
    const cam = makeCamera();
    attachOrbitControls(canvas as unknown as HTMLCanvasElement, cam);

    rec.fire('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    // The move arrives on window — the path that was dead on iOS before.
    win.fire('pointermove', { pointerId: 1, clientX: 150, clientY: 100 });

    // drag right (+50 px) → yaw decreases by 50 * 0.005 (globe drag).
    expect(cam.yaw).toBeCloseTo(-0.25, 5);
  });

  it('recovers from a missed mouse pointerup (no stale pinch state)', () => {
    // Without capture, a mouse released outside the viewport fires no
    // window pointerup, stranding the prior pointer. A fresh mouse-down
    // must reset that so the next drag orbits rather than mis-promoting
    // to a two-pointer pinch.
    const { canvas, rec } = makeCanvas();
    const cam = makeCamera();
    attachOrbitControls(canvas as unknown as HTMLCanvasElement, cam);

    // First drag, but the pointerup never arrives (released off-screen).
    rec.fire('pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 0,
      clientY: 0,
    });

    // Second, fresh mouse-down + move should orbit normally.
    rec.fire('pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    win.fire('pointermove', { pointerId: 1, clientX: 160, clientY: 100 });

    // drag right (+60 px) → yaw decreases by 60 * 0.005 = 0.3. A pinch
    // mis-promotion would have left yaw at 0.
    expect(cam.yaw).toBeCloseTo(-0.3, 5);
  });

  it('teardown removes the window listeners it added', () => {
    const { canvas, rec } = makeCanvas();
    const cam = makeCamera();
    const detach = attachOrbitControls(canvas as unknown as HTMLCanvasElement, cam);

    detach();

    expect(rec.listeners).toHaveLength(0);
    expect(win.listeners).toHaveLength(0);

    // A post-detach move must not move the camera.
    rec.fire('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    win.fire('pointermove', { pointerId: 1, clientX: 150, clientY: 100 });
    expect(cam.yaw).toBe(0);
  });
});

describe('attachOrbitControls — gesture hooks (Redux wiring)', () => {
  it('onGestureStart fires exactly once for the first pointerdown', () => {
    const { canvas, rec } = makeCanvas();
    const onGestureStart = vi.fn<() => void>();

    attachOrbitControls(canvas as unknown as HTMLCanvasElement, makeCamera(), {
      onGestureStart,
    });

    rec.fire('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      button: 0,
      clientX: 100,
      clientY: 100,
    });

    expect(onGestureStart).toHaveBeenCalledOnce();
  });

  it('onGestureStart does NOT fire when a second finger promotes to pinch', () => {
    // The gesture-start commit (seed + beginDrag + cancelCameraTween) should
    // only fire once per gesture, on the first contact. A second finger
    // changes the mode to 'pinch' but does not start a new gesture.
    const { canvas, rec } = makeCanvas();
    const onGestureStart = vi.fn<() => void>();

    attachOrbitControls(canvas as unknown as HTMLCanvasElement, makeCamera(), {
      onGestureStart,
    });

    rec.fire('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    // Second finger down — promotes to pinch.
    rec.fire('pointerdown', {
      pointerId: 2,
      pointerType: 'touch',
      button: 0,
      clientX: 200,
      clientY: 200,
    });

    // onGestureStart fired only on the first contact.
    expect(onGestureStart).toHaveBeenCalledOnce();
  });

  it('onGestureEnd fires when ALL contacts are lifted', () => {
    const { canvas, rec } = makeCanvas();
    const onGestureEnd = vi.fn<() => void>();

    attachOrbitControls(canvas as unknown as HTMLCanvasElement, makeCamera(), {
      onGestureEnd,
    });

    rec.fire('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    win.fire('pointerup', { pointerId: 1, clientX: 110, clientY: 110 });

    expect(onGestureEnd).toHaveBeenCalledOnce();
  });

  it('onGestureEnd does NOT fire when only one of two contacts is lifted', () => {
    // Gesture end (commitCameraPose + endDrag) must only fire when the last
    // finger leaves. A pinch where one finger lifts should not commit.
    const { canvas, rec } = makeCanvas();
    const onGestureEnd = vi.fn<() => void>();

    attachOrbitControls(canvas as unknown as HTMLCanvasElement, makeCamera(), {
      onGestureEnd,
    });

    rec.fire('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    rec.fire('pointerdown', {
      pointerId: 2,
      pointerType: 'touch',
      button: 0,
      clientX: 200,
      clientY: 200,
    });
    // First finger up — one still down.
    win.fire('pointerup', { pointerId: 1, clientX: 100, clientY: 100 });

    expect(onGestureEnd).not.toHaveBeenCalled();
  });

  it('onChange fires after an orbit (pointermove)', () => {
    const { canvas, rec } = makeCanvas();
    const onChange = vi.fn<() => void>();

    attachOrbitControls(canvas as unknown as HTMLCanvasElement, makeCamera(), { onChange });

    rec.fire('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    const countAfterDown = onChange.mock.calls.length;
    win.fire('pointermove', { pointerId: 1, clientX: 150, clientY: 100 });

    expect(onChange.mock.calls.length).toBeGreaterThan(countAfterDown);
  });

  it('a wheel tick calls onZoom with the factor and the cursor it is anchored on', () => {
    const onZoom = vi.fn<(factor: number, cursorCss: { x: number; y: number }) => void>();
    const onChange = vi.fn<() => void>();
    const cam = makeCamera();
    const { canvas, rec } = makeCanvas();

    attachOrbitControls(canvas as unknown as HTMLCanvasElement, cam, { onZoom, onChange });

    const before = cam.distance;
    rec.fire('wheel', { deltaY: 100, clientX: 320, clientY: 240, preventDefault: vi.fn() });

    // exp(100 * 0.001) = exp(0.1) ≈ 1.105 — zoom OUT (distance grows).
    expect(onZoom).toHaveBeenCalledTimes(1);
    expect(onZoom.mock.calls[0]?.[0]).toBeCloseTo(Math.exp(0.1), 6);
    // The cursor is load-bearing: it is what the engine re-picks the zoom
    // anchor from every tick.
    expect(onZoom.mock.calls[0]?.[1]).toEqual({ x: 320, y: 240 });
    // This module applies no zoom of its own — the engine routes it to whichever
    // register renders the camera, and wakes the loop itself.
    expect(cam.distance).toBe(before);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a wheel DURING a drag goes out through the same onZoom path', () => {
    // A mid-gesture tick still lands in the drag register — but engine-side,
    // where the surface geometry the cursor anchor needs actually lives.
    const onZoom = vi.fn<(factor: number, cursorCss: { x: number; y: number }) => void>();
    const cam = makeCamera();
    const { canvas, rec } = makeCanvas();

    attachOrbitControls(canvas as unknown as HTMLCanvasElement, cam, { onZoom });

    rec.fire('pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    rec.fire('wheel', { deltaY: 100, clientX: 100, clientY: 100, preventDefault: vi.fn() });

    expect(onZoom).toHaveBeenCalledTimes(1);
    expect(onZoom.mock.calls[0]?.[0]).toBeCloseTo(Math.exp(0.1), 6);
  });

  it('drops inherited inertial wheel ticks whose gesture started BEFORE the drag', () => {
    // Momentum stream begins before any pointer contact (ticks 50 ms apart —
    // well under WHEEL_GESTURE_GAP_MS's 150 ms, so they're one continuous
    // gesture). Once a drag starts mid-stream, later ticks in that SAME
    // gesture must be dropped — see fw-c-brief.md.
    const onZoom = vi.fn<(factor: number, cursorCss: { x: number; y: number }) => void>();
    const cam = makeCamera();
    const { canvas, rec } = makeCanvas();
    let t = 0;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => t);

    attachOrbitControls(canvas as unknown as HTMLCanvasElement, cam, { onZoom });

    rec.fire('wheel', { deltaY: 10, clientX: 100, clientY: 100, preventDefault: vi.fn() });
    t = 50;
    rec.fire('wheel', { deltaY: 10, clientX: 100, clientY: 100, preventDefault: vi.fn() });
    expect(onZoom).toHaveBeenCalledTimes(2);

    // Drag starts mid-stream.
    t = 100;
    rec.fire('pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 300,
      clientY: 300,
    });

    // The momentum stream continues into the drag — same gesture (50 ms gap).
    t = 150;
    rec.fire('wheel', { deltaY: 10, clientX: 100, clientY: 100, preventDefault: vi.fn() });
    t = 200;
    rec.fire('wheel', { deltaY: 10, clientX: 100, clientY: 100, preventDefault: vi.fn() });

    // No new calls — both in-drag ticks were dropped.
    expect(onZoom).toHaveBeenCalledTimes(2);

    nowSpy.mockRestore();
  });

  it('applies a fresh wheel gesture begun mid-drag (big gap from the previous tick)', () => {
    // A deliberate two-finger scroll started WHILE dragging still works: its
    // first tick has a big gap since the previous wheel tick, so it reads as
    // a NEW gesture that started during this drag — allowed.
    const onZoom = vi.fn<(factor: number, cursorCss: { x: number; y: number }) => void>();
    const cam = makeCamera();
    const { canvas, rec } = makeCanvas();
    let t = 0;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => t);

    attachOrbitControls(canvas as unknown as HTMLCanvasElement, cam, { onZoom });

    // A stray momentum tick well before the drag.
    rec.fire('wheel', { deltaY: 10, clientX: 100, clientY: 100, preventDefault: vi.fn() });
    expect(onZoom).toHaveBeenCalledTimes(1);

    t = 300;
    rec.fire('pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 300,
      clientY: 300,
    });

    // Gap from the last wheel tick is 300 ms — exceeds WHEEL_GESTURE_GAP_MS,
    // so this starts a fresh gesture that began during the active drag.
    rec.fire('wheel', { deltaY: 20, clientX: 100, clientY: 100, preventDefault: vi.fn() });
    expect(onZoom).toHaveBeenCalledTimes(2);

    nowSpy.mockRestore();
  });

  it('a pinch step reports the finger-distance ratio and the pinch MIDPOINT as its cursor', () => {
    // The midpoint is the pinch's cursor — the engine anchors the zoom on
    // whatever surface point sits under it, exactly as it does for a wheel.
    const onZoom = vi.fn<(factor: number, cursorCss: { x: number; y: number }) => void>();
    const { canvas, rec } = makeCanvas();

    attachOrbitControls(canvas as unknown as HTMLCanvasElement, makeCamera(), { onZoom });

    rec.fire('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    rec.fire('pointerdown', {
      pointerId: 2,
      pointerType: 'touch',
      button: 0,
      clientX: 100,
      clientY: 0,
    });
    // Fingers spread 100 px → 200 px: zoom IN, factor = 100 / 200.
    win.fire('pointermove', { pointerId: 2, clientX: 200, clientY: 0 });

    expect(onZoom).toHaveBeenCalledTimes(1);
    expect(onZoom.mock.calls[0]?.[0]).toBeCloseTo(0.5, 9);
    expect(onZoom.mock.calls[0]?.[1]).toEqual({ x: 100, y: 0 });
  });
});

describe('attachOrbitControls — orbit-drag rate damps near a focused body’s surface', () => {
  // The flat 0.005 rad/px orbit rate rotates about the pivot's CENTRE, so the
  // ground distance it sweeps scales with the pivot's radius — irrelevant to
  // how far the camera actually is from that ground. `orbitRadPerPixel` fixes
  // that by damping the rate at low altitude (see its docstring for the ~350x
  // Earth-standoff numbers). These two cases are the regression that matters:
  // near a surface the same drag must barely turn the camera, and with no
  // surface to damp against (or far above one) today's flat rate must be
  // untouched.

  it('the same drag yaws far less near a surface than at the same pivot from afar', () => {
    const nearCam = makeCamera();
    nearCam.distance = EARTH_RADIUS_MPC * 1.02; // ~127 km altitude, near-surface regime
    const { canvas: nearCanvas, rec: nearRec } = makeCanvas();
    attachOrbitControls(nearCanvas as unknown as HTMLCanvasElement, nearCam, {
      pivotRadiusMpc: () => EARTH_RADIUS_MPC,
      // target === [0,0,0] === body centre in this fixture, so altitude ===
      // distance − radius exactly — the regression floor the migration must
      // reproduce bit-for-bit.
      pivotAltitudeMpc: () => nearCam.distance - EARTH_RADIUS_MPC,
    });

    const farCam = makeCamera();
    farCam.distance = EARTH_RADIUS_MPC * 1000; // deep orbital view of the same body
    const { canvas: farCanvas, rec: farRec } = makeCanvas();
    attachOrbitControls(farCanvas as unknown as HTMLCanvasElement, farCam, {
      pivotRadiusMpc: () => EARTH_RADIUS_MPC,
      pivotAltitudeMpc: () => farCam.distance - EARTH_RADIUS_MPC,
    });

    // Identical drag (+50 px) on both, driven through the same window — each
    // attachment tracks its own pointer/drag state independently.
    nearRec.fire('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    farRec.fire('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    win.fire('pointermove', { pointerId: 1, clientX: 150, clientY: 100 });

    // Far above the surface, the damping term hasn't engaged — matches
    // today's flat rate almost exactly.
    expect(farCam.yaw).toBeCloseTo(-50 * 0.005, 4);

    // At the standoff floor, the same drag turns the camera a tiny fraction
    // of that — this is the fix: the ground now tracks the cursor instead of
    // sweeping a third of a screen width per pixel.
    expect(Math.abs(nearCam.yaw)).toBeLessThan(Math.abs(farCam.yaw) / 50);
  });

  it('with no pivot radius, a drag yaws by exactly today’s flat dx * 0.005', () => {
    // No pivotRadiusMpc option at all ⇒ pivotRadius() resolves to null ⇒
    // orbitRadPerPixel returns the flat cap unchanged — the deep-space /
    // unfocused path this change must not touch.
    const cam = makeCamera();
    const { canvas, rec } = makeCanvas();
    attachOrbitControls(canvas as unknown as HTMLCanvasElement, cam);

    rec.fire('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    win.fire('pointermove', { pointerId: 1, clientX: 150, clientY: 100 });

    expect(cam.yaw).toBeCloseTo(-50 * 0.005, 6);
  });
});

describe('attachOrbitControls — pan altitude-currency fix (§4.5)', () => {
  // The pan gesture translates cam.target along the camera's right+up axes
  // by a screen-aligned amount.  When a focused body's surface is nearby,
  // `pxToWorld` (pixel→world conversion factor) must scale to ALTITUDE
  // (distance − pivotRadius) rather than raw distance, so a fixed pan gesture
  // moves the target by a distance scaled to the actual ground span in view.
  // Without this fix, near Earth's surface a pan gesture moves the target by
  // a distance scaled to Earth's whole radius instead, sweeping too far.

  it('pan uses altitude when a pivot is focused (near-surface pan regime)', () => {
    const cam = makeCamera(102);
    // Near-surface framing: altitude = 2 units, pivot = 100 units.
    // This creates a 51× divergence between raw-distance and altitude formulas,
    // analogous to a ~127 km altitude above Earth's surface.
    const pivotRadius = 100;
    cam.target = [0, 0, 0];
    updatePosition(cam); // Sync cam.position to the new distance
    const { canvas, rec } = makeCanvas();

    attachOrbitControls(canvas as unknown as HTMLCanvasElement, cam, {
      pivotRadiusMpc: () => pivotRadius,
      // target === [0,0,0] === pivot centre in this fixture, so altitude ===
      // distance − radius exactly — the regression floor the migration must
      // reproduce bit-for-bit.
      pivotAltitudeMpc: () => cam.distance - pivotRadius,
    });

    // Start a pan (right/middle mouse button).
    rec.fire('pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      button: 2,
      clientX: 500,
      clientY: 500,
    });
    // Drag right by 100 CSS pixels.
    win.fire('pointermove', { pointerId: 1, clientX: 600, clientY: 500 });

    // Hand-compute the expected target shift using ALTITUDE formula (with the fix).
    // pxToWorld = 2 * (distance - pivotRadius) * tan(fovY/2) / cssHeight
    const cssHeight = 1000;
    const fovYRad = (Math.PI / 180) * 60;
    const altitude = cam.distance - pivotRadius;
    const altitudePxToWorld = (2 * altitude * Math.tan(fovYRad / 2)) / cssHeight;
    const expectedAltitudeShift = -100 * altitudePxToWorld;

    // With the fix, cam.target[0] should match the altitude formula.
    // Without the fix, it would match the raw-distance formula (51x larger).
    expect(cam.target[0]).toBeCloseTo(expectedAltitudeShift, 5);
  });

  it('pan degenerates to unchanged formula when no pivot is focused (deep-space pan)', () => {
    // No pivotRadiusMpc option ⇒ pivotRadius() returns null ⇒ altitude = distance - 0 = distance.
    // Pan must use raw distance, unchanged. This is the regression floor: existing unfocused
    // pans (galaxies, structures) must remain byte-identical.
    const cam = makeCamera(1000);
    cam.target = [0, 0, 0];
    const { canvas, rec } = makeCanvas();

    // Attach WITHOUT pivotRadiusMpc option — no focused body.
    attachOrbitControls(canvas as unknown as HTMLCanvasElement, cam);

    rec.fire('pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      button: 2,
      clientX: 500,
      clientY: 500,
    });
    win.fire('pointermove', { pointerId: 1, clientX: 600, clientY: 500 });

    // Hand-compute the expected target shift using RAW-DISTANCE formula (unchanged).
    // With no pivot, altitude = distance, so both old and new code use the same formula:
    // pxToWorld = 2 * distance * tan(fovY/2) / cssHeight
    const cssHeight = 1000;
    const fovYRad = (Math.PI / 180) * 60;
    const pxToWorld = (2 * cam.distance * Math.tan(fovYRad / 2)) / cssHeight;
    const expectedRawDistanceShift = -100 * pxToWorld;

    // Assert the target moved by the raw-distance formula (regression floor).
    expect(cam.target[0]).toBeCloseTo(expectedRawDistanceShift, 5);
  });

  it('keys pan on the caller-supplied EYE altitude, not distance − radius, once the two diverge (FW-A real-bug regression)', () => {
    // A `distance − radius` shortcut assumes `cam.target` sits exactly at the
    // pivot's centre. This fixture simulates the case that assumption breaks
    // — a prior pan already strafed the target away from the body's centre
    // (or, after FW-B, zoom-to-cursor moved the eye independently of the
    // pivot) — by supplying a `pivotAltitudeMpc` the caller resolved
    // independently (against the TRUE eye-to-surface distance) that
    // disagrees sharply with what `cam.distance - pivotRadiusMpc` would say.
    // Pre-migration `orbitControls.ts` computed `cam.distance -
    // pivotRadius()` itself and never read `pivotAltitudeMpc` — reverting the
    // pan site to that formula makes this test fail (see the divergence
    // sanity check below for proof the two formulas actually disagree here).
    const cam = makeCamera(102);
    const pivotRadius = 100; // distance − radius = 2: the STALE, wrong reading
    const trueEyeAltitudeMpc = 40; // the TRUE post-pan eye altitude
    cam.target = [0, 0, 0];
    updatePosition(cam);
    const { canvas, rec } = makeCanvas();

    attachOrbitControls(canvas as unknown as HTMLCanvasElement, cam, {
      pivotRadiusMpc: () => pivotRadius,
      pivotAltitudeMpc: () => trueEyeAltitudeMpc,
    });

    rec.fire('pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      button: 2,
      clientX: 500,
      clientY: 500,
    });
    win.fire('pointermove', { pointerId: 1, clientX: 600, clientY: 500 });

    const cssHeight = 1000;
    const fovYRad = (Math.PI / 180) * 60;
    const eyeBasedShift = -100 * ((2 * trueEyeAltitudeMpc * Math.tan(fovYRad / 2)) / cssHeight);
    const staleDistanceMinusRadiusShift =
      -100 * ((2 * (cam.distance - pivotRadius) * Math.tan(fovYRad / 2)) / cssHeight);

    // Sanity: the two formulas actually diverge here — otherwise a pass would
    // prove nothing about which one the pan site reads.
    expect(Math.abs(eyeBasedShift - staleDistanceMinusRadiusShift)).toBeGreaterThan(
      Math.abs(eyeBasedShift) * 0.5,
    );

    expect(cam.target[0]).toBeCloseTo(eyeBasedShift, 5);
  });
});

describe('attachOrbitControls — surface drag rotation (spec §4.4 hit branch)', () => {
  // The exact solve needs `cam.position` to already reflect the drag's
  // starting distance (it's read via `forwardOf`/`cursorRayWorld` below to
  // construct a grab, not by `attachOrbitControls` itself) — `makeCamera`
  // computes it via `createOrbitCamera`, so passing `distance` up front
  // (rather than mutating `.distance` post-construction, as the damping
  // tests above do) keeps it in sync.
  const RADIUS_MPC = 10;
  const CANVAS_SIZE = { width: 1000, height: 1000 };
  const FOV_Y_RAD = (Math.PI / 180) * 60;

  function forwardOf(cam: OrbitCamera): Vec3 {
    const v: Vec3 = [
      cam.target[0] - cam.position[0],
      cam.target[1] - cam.position[1],
      cam.target[2] - cam.position[2],
    ];
    const m = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / m, v[1] / m, v[2] / m];
  }

  /** The lon/lat under `cssPos` for `cam` — built via `cursorRayWorld` +
   * `cursorSurfaceHit`, independent of `orbitControls`'s own drag math. */
  function grabAtCss(cam: OrbitCamera, cssPos: { x: number; y: number }) {
    const ray = cursorRayWorld(
      cssPos,
      CANVAS_SIZE,
      cam.position,
      forwardOf(cam),
      0,
      [0, 1, 0],
      FOV_Y_RAD,
      1,
    );
    const point = cursorSurfaceHit(ray, [0, 0, 0], RADIUS_MPC, IDENTITY_MAT3);
    if (point === null) throw new Error('test fixture: ray misses the sphere');
    return point;
  }

  it('a captured hit on the focused body diverges from the flat rate near the limb', () => {
    // Off-centre, close orbit (h = 5 Mpc altitude on a 10 Mpc body) — the
    // regime where `orbitRadPerPixel`'s isotropic rate (correct only at
    // screen centre, see its header) should visibly disagree with the exact
    // per-pixel solve `surfaceDragRotation` performs.
    const cam = makeCamera(15);
    const grabbedPoint = { bodyId: 'earth' as BodyId, point: grabAtCss(cam, { x: 850, y: 850 }) };
    const { canvas, rec } = makeCanvas();

    attachOrbitControls(canvas as unknown as HTMLCanvasElement, cam, {
      hoveredSurfacePoint: () => grabbedPoint,
      dragPivotFrame: () => ({
        bodyId: 'earth' as BodyId,
        bodyOrientation: IDENTITY_MAT3 as unknown as [
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
        ],
        bodyCentreMpc: [0, 0, 0],
        radiusMpc: RADIUS_MPC,
      }),
    });

    rec.fire('pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 850,
      clientY: 850,
    });
    win.fire('pointermove', { pointerId: 1, clientX: 890, clientY: 890 });

    const radPerPixel = orbitRadPerPixel(
      FOV_Y_RAD,
      15 - RADIUS_MPC,
      CANVAS_SIZE.height,
      RADIUS_MPC,
    );
    const expectedDYaw = -40 * radPerPixel;
    const expectedDPitch = 40 * radPerPixel;
    const yawOff = Math.abs((cam.yaw - expectedDYaw) / expectedDYaw);
    const pitchOff = Math.abs((cam.pitch - expectedDPitch) / expectedDPitch);

    expect(Math.max(yawOff, pitchOff)).toBeGreaterThan(0.2);
  });

  it('falls back to the flat rate when the grabbed body no longer matches dragPivotFrame', () => {
    // The grab was captured against 'earth', but the live geometry getter now
    // reports a DIFFERENT focused body (a focus swap mid-drag) — the orbit
    // branch must fall back to the pre-existing flat rate exactly, not the
    // exact solve, per the "Drag hit/miss coexistence" constraint.
    const cam = makeCamera(15);
    const { canvas, rec } = makeCanvas();

    attachOrbitControls(canvas as unknown as HTMLCanvasElement, cam, {
      hoveredSurfacePoint: () => ({ bodyId: 'earth' as BodyId, point: { lonDeg: 0, latDeg: 90 } }),
      dragPivotFrame: () => ({
        bodyId: 'moon' as BodyId,
        bodyOrientation: IDENTITY_MAT3 as unknown as [
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
        ],
        bodyCentreMpc: [0, 0, 0],
        radiusMpc: RADIUS_MPC,
      }),
      pivotRadiusMpc: () => RADIUS_MPC,
      pivotAltitudeMpc: () => cam.distance - RADIUS_MPC,
    });

    rec.fire('pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    win.fire('pointermove', { pointerId: 1, clientX: 150, clientY: 100 });

    const radPerPixel = orbitRadPerPixel(
      FOV_Y_RAD,
      15 - RADIUS_MPC,
      CANVAS_SIZE.height,
      RADIUS_MPC,
    );
    expect(cam.yaw).toBeCloseTo(-50 * radPerPixel, 10);
  });
});
