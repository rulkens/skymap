/**
 * orbitControls — unit tests for the canvas → OrbitCamera input mapping,
 * focused on the listener-target contract that keeps touch gestures
 * working on iOS Safari.
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
 * Vitest runs in `node` here (no jsdom), so — matching
 * `inputBindings.test.ts` — we hand-roll EventTarget recorders for the
 * canvas and a stubbed `window`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { attachOrbitControls } from '../../../src/services/camera/orbitControls';
import { createOrbitCamera } from '../../../src/services/camera/orbitCamera';
import type { OrbitCamera } from '../../../src/@types/camera/OrbitCamera';

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
