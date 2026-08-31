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
 *   - `onChange` fires after any orbit, pan, pinch, or in-gesture wheel change;
 *     a discrete wheel zoom (no gesture) fires `onZoom` instead.
 *   - `pivotRadiusMpc` reaches BOTH in-module clamp sites (pinch, and a wheel
 *     during a held gesture), so a zoom-in on a framed body stops just off its
 *     surface instead of passing through the centre.
 *
 * Vitest runs in `node` here (no jsdom), so — matching
 * `inputBindings.test.ts` — we hand-roll EventTarget recorders for the
 * canvas and a stubbed `window`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { attachOrbitControls } from '../../../src/services/camera/orbitControls';
import { createOrbitCamera } from '../../../src/utils/camera/createOrbitCamera';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { OrbitCamera } from '../../../src/@types/camera/OrbitCamera';

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

function makeCamera(): OrbitCamera {
  return createOrbitCamera({
    target: [0, 0, 0],
    distance: 100,
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

  it('a discrete wheel zoom (no gesture) calls onZoom with the distance factor, not onChange', () => {
    const onZoom = vi.fn<(factor: number) => void>();
    const onChange = vi.fn<() => void>();
    const { canvas, rec } = makeCanvas();

    attachOrbitControls(canvas as unknown as HTMLCanvasElement, makeCamera(), { onZoom, onChange });

    rec.fire('wheel', { deltaY: 100, preventDefault: vi.fn() });

    // exp(100 * 0.001) = exp(0.1) ≈ 1.105 — zoom OUT (distance grows).
    expect(onZoom).toHaveBeenCalledTimes(1);
    expect(onZoom.mock.calls[0]?.[0]).toBeCloseTo(Math.exp(0.1), 6);
    // With no gesture, `cam` is not the rendered pose; onZoom commits to `base`
    // and wakes the loop itself, so the onChange wake path is NOT taken.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a wheel DURING a drag folds into the cam register and fires onChange (no onZoom)', () => {
    const onZoom = vi.fn<(factor: number) => void>();
    const onChange = vi.fn<() => void>();
    const cam = makeCamera();
    const { canvas, rec } = makeCanvas();

    attachOrbitControls(canvas as unknown as HTMLCanvasElement, cam, { onZoom, onChange });

    // Begin a gesture so activePointers.size > 0.
    rec.fire('pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    const before = cam.distance;
    rec.fire('wheel', { deltaY: 100, preventDefault: vi.fn() });

    // Folded into the live register (orbitDrag renders it); rides onGestureEnd.
    expect(cam.distance).toBeGreaterThan(before);
    expect(onChange).toHaveBeenCalled();
    expect(onZoom).not.toHaveBeenCalled();
  });
});

describe('attachOrbitControls — the zoom floor stops at a focused body’s surface', () => {
  // Both in-module zoom paths dolly toward the orbit TARGET, which for a framed
  // body is its CENTRE. The clamp's absolute floor is 0.048 Earth radii, so
  // without the pivot radius reaching these two sites a zoom-in walks the camera
  // thousands of km under the crust. Distances are asserted in body radii so the
  // property reads as "outside the surface, close to it".

  it('pinching in stops just outside the surface', () => {
    const cam = makeCamera();
    cam.distance = EARTH_RADIUS_MPC * 4;
    const { canvas, rec } = makeCanvas();

    attachOrbitControls(canvas as unknown as HTMLCanvasElement, cam, {
      pivotRadiusMpc: () => EARTH_RADIUS_MPC,
    });

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
      clientX: 10,
      clientY: 0,
    });
    // Fingers spreading apart → zoom IN (distance × lastDist / newDist). Three
    // ×100 steps would land at 4e-6 radii, deep inside the mantle.
    for (const x of [1000, 100000, 10000000]) {
      win.fire('pointermove', { pointerId: 2, clientX: x, clientY: 0 });
    }

    const radii = cam.distance / EARTH_RADIUS_MPC;
    expect(radii).toBeGreaterThan(1);
    expect(radii).toBeLessThan(1.05);
  });

  it('a wheel tick during a held gesture stops just outside the surface', () => {
    // The wheel-during-gesture path folds into the live `cam` register rather
    // than going out through onZoom, so it needs its own floor.
    const cam = makeCamera();
    cam.distance = EARTH_RADIUS_MPC * 4;
    const { canvas, rec } = makeCanvas();

    attachOrbitControls(canvas as unknown as HTMLCanvasElement, cam, {
      pivotRadiusMpc: () => EARTH_RADIUS_MPC,
    });

    rec.fire('pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    rec.fire('wheel', { deltaY: -20000, preventDefault: vi.fn() });

    const radii = cam.distance / EARTH_RADIUS_MPC;
    expect(radii).toBeGreaterThan(1);
    expect(radii).toBeLessThan(1.05);
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
    });

    const farCam = makeCamera();
    farCam.distance = EARTH_RADIUS_MPC * 1000; // deep orbital view of the same body
    const { canvas: farCanvas, rec: farRec } = makeCanvas();
    attachOrbitControls(farCanvas as unknown as HTMLCanvasElement, farCam, {
      pivotRadiusMpc: () => EARTH_RADIUS_MPC,
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
