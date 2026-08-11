/**
 * createOrbitCameraInput — the galaxy tool's orbit camera. The engine around it
 * has no GPU test coverage, but this module is plain CPU state, so the timing
 * behaviours that a refactor would quietly break are pinned here: the idle gate
 * before auto-rotate resumes, both halves of the auto-rotate toggle, the
 * exponential wheel and its clamp, and that damping converges rather than snaps.
 *
 * Vitest runs `node` here (no jsdom), so — matching `orbitControls.test.ts` —
 * the canvas and `window` are hand-rolled EventTarget recorders.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createOrbitCameraInput } from '../../../../../tools/galaxy-renderer/src/engine/camera/createOrbitCameraInput';
import { orbitEye } from '../../../../../tools/galaxy-renderer/src/engine/camera/orbitEye';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

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
  const fire = (type: string, event: unknown): void => {
    for (const l of [...listeners]) if (l.type === type) l.handler(event);
  };
  return { target, listeners, fire, has: (t: string) => listeners.some((l) => l.type === t) };
}

function makeCanvas() {
  const rec = makeRecorder();
  const canvas = Object.assign(rec.target, {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    clientWidth: 1000,
    clientHeight: 1000,
  }) as unknown as HTMLCanvasElement;
  return { canvas, rec };
}

const ORIGIN: Vec3 = [0, 0, 0];

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
  if (originalWindow === undefined) delete g.window;
  else g.window = originalWindow;
});

/** Deliver a wheel notch of `deltaY` to whatever handler the module registered. */
function wheel(rec: ReturnType<typeof makeRecorder>, deltaY: number): void {
  rec.fire('wheel', { deltaY, preventDefault: () => {} });
}

describe('createOrbitCameraInput — idle gate before auto-rotate', () => {
  it('holds azimuth inside the 2500 ms gate and advances past it', () => {
    const { canvas } = makeCanvas();
    const t0 = performance.now();
    const camera = createOrbitCameraInput(canvas, { autoRotate: true });
    const az0 = camera.getCamera().az;

    // Construction counts as an interaction, so a frame 1 s later is still gated.
    camera.update(0.016, t0 + 1000);
    expect(camera.getCamera().az).toBe(az0);

    camera.update(0.016, t0 + 4000);
    expect(camera.getCamera().az).toBeCloseTo(az0 + 0.016 * 0.12, 12);
  });

  it('does not spin while a drag is held, however long it has been idle', () => {
    const { canvas, rec } = makeCanvas();
    const t0 = performance.now();
    const camera = createOrbitCameraInput(canvas, { autoRotate: true });

    rec.fire('pointerdown', { button: 0, clientX: 0, clientY: 0, pointerId: 1 });
    const az0 = camera.getCamera().az;
    // `now` is far past the gate; only the held pointer suppresses the spin.
    camera.update(0.016, t0 + 60_000);
    expect(camera.getCamera().az).toBe(az0);

    win.fire('pointerup', {});
    camera.update(0.016, t0 + 120_000);
    expect(camera.getCamera().az).toBeGreaterThan(az0);
  });
});

describe('createOrbitCameraInput — setAutoRotate', () => {
  it('snaps the damped azimuth onto the live one when stopping (no coast)', () => {
    const { canvas } = makeCanvas();
    const t0 = performance.now();
    const camera = createOrbitCameraInput(canvas, { autoRotate: true });

    // Spin long enough for the damped shadow to settle into its constant lag.
    let now = t0 + 3000;
    for (let i = 0; i < 60; i++) {
      now += 16;
      camera.update(0.016, now);
    }

    // dt 0 makes `update` a pure read of the damped pose: k = 0, no spin step.
    const before = camera.getCamera();
    const lagging = camera.update(0, now).eye;
    const live = orbitEye(before.az, before.el, before.dist, ORIGIN);
    // Guard against a vacuous assertion below: there must BE a lag to snap out.
    expect(lagging[0]).not.toBeCloseTo(live[0], 6);

    camera.setAutoRotate(false);
    const after = camera.getCamera();
    const snapped = camera.update(0, now).eye;
    const expected = orbitEye(after.az, after.el, after.dist, ORIGIN);
    expect(snapped[0]).toBeCloseTo(expected[0], 12);
    expect(snapped[1]).toBeCloseTo(expected[1], 12);
    expect(snapped[2]).toBeCloseTo(expected[2], 12);
  });

  it('starts spinning immediately rather than waiting out the gate', () => {
    const { canvas } = makeCanvas();
    const t0 = performance.now();
    const camera = createOrbitCameraInput(canvas, { autoRotate: false });
    const az0 = camera.getCamera().az;

    camera.setAutoRotate(true);
    // One frame later — nowhere near 2500 ms of idle time has passed.
    camera.update(0.016, t0 + 16);
    expect(camera.getCamera().az).toBeCloseTo(az0 + 0.016 * 0.12, 12);
  });
});

describe('createOrbitCameraInput — wheel zoom', () => {
  it('moves by a constant ratio per notch at any distance', () => {
    const { canvas, rec } = makeCanvas();
    const camera = createOrbitCameraInput(canvas, { autoRotate: false });

    camera.setView({ dist: 10 });
    wheel(rec, 100);
    const nearRatio = camera.getCamera().dist / 10;

    camera.setView({ dist: 1000 });
    wheel(rec, 100);
    const farRatio = camera.getCamera().dist / 1000;

    // Equal ratios is the property the exponential exists for: a constant-step
    // zoom would move both distances by the same absolute amount instead.
    expect(farRatio).toBeCloseTo(nearRatio, 12);
    // Without this the equality above would also pass on a wheel that did nothing.
    expect(nearRatio).not.toBeCloseTo(1, 3);
  });

  it('clamps at both ends of the five-decade range', () => {
    const { canvas, rec } = makeCanvas();
    const camera = createOrbitCameraInput(canvas, { autoRotate: false });

    for (let i = 0; i < 100; i++) wheel(rec, 1000);
    expect(camera.getCamera().dist).toBe(8000);

    for (let i = 0; i < 100; i++) wheel(rec, -1000);
    expect(camera.getCamera().dist).toBe(0.02);
  });
});

describe('createOrbitCameraInput — damping', () => {
  it('converges toward a new pose over many frames instead of snapping', () => {
    const { canvas } = makeCanvas();
    let now = performance.now();
    const camera = createOrbitCameraInput(canvas, { autoRotate: false });

    camera.setView({ dist: 100 });
    const first = camera.update(0.016, now).dist;
    expect(first).toBeGreaterThan(31);
    expect(first).toBeLessThan(100);

    let last = first;
    for (let i = 0; i < 300; i++) {
      now += 16;
      const { dist } = camera.update(0.016, now);
      expect(dist).toBeGreaterThanOrEqual(last);
      last = dist;
    }
    expect(last).toBeCloseTo(100, 6);
  });
});

describe('createOrbitCameraInput — dispose', () => {
  it('removes the window pointerup listener as well as the canvas ones', () => {
    const { canvas, rec } = makeCanvas();
    const camera = createOrbitCameraInput(canvas, { autoRotate: false });
    expect(win.has('pointerup')).toBe(true);

    camera.dispose();
    expect(rec.listeners).toHaveLength(0);
    expect(win.listeners).toHaveLength(0);
  });
});
