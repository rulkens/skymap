/**
 * orbitControls — the gesture recognizer's DOM contract.
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
 * tests lock that contract in, plus the gesture-boundary emissions the
 * frame's drain turns into Redux edges.
 *
 * The camera math is no longer here — it moved to `applyInputToCamera`,
 * driven once per frame by `drainInput`.
 *
 * Vitest runs in `node` here (no jsdom), so — matching
 * `inputBindings.test.ts` — we hand-roll EventTarget recorders for the
 * canvas and a stubbed `window`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { attachOrbitControls } from '../../../src/services/camera/orbitControls';
import type { InputGestureEvent } from '../../../src/@types/camera/InputGestureEvent';

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
 * it stays untouched.
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

/** Collects the recognizer's emissions in arrival order. */
function makeSink() {
  const events: InputGestureEvent[] = [];
  const emit = (e: InputGestureEvent): void => {
    events.push(e);
  };
  const kinds = (): string[] => events.map((e) => e.kind);
  return { events, emit, kinds };
}

const touchDown = (pointerId: number, clientX: number, clientY: number) => ({
  pointerId,
  pointerType: 'touch',
  button: 0,
  clientX,
  clientY,
});

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
    attachOrbitControls(canvas as unknown as HTMLCanvasElement, makeSink().emit);

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
    attachOrbitControls(canvas as unknown as HTMLCanvasElement, makeSink().emit);

    rec.fire('pointerdown', touchDown(1, 100, 100));

    expect(setPointerCapture).not.toHaveBeenCalled();
  });

  it('emits an orbit move from a window-dispatched pointermove', () => {
    const { canvas, rec } = makeCanvas();
    const sink = makeSink();
    attachOrbitControls(canvas as unknown as HTMLCanvasElement, sink.emit);

    rec.fire('pointerdown', touchDown(1, 100, 100));
    // The move arrives on window — the path that was dead on iOS before.
    win.fire('pointermove', { pointerId: 1, clientX: 150, clientY: 100 });

    expect(sink.events).toContainEqual({ kind: 'dragMove', mode: 'orbit', xPx: 150, yPx: 100 });
  });

  it('recovers from a missed mouse pointerup (no stale pinch state)', () => {
    // Without capture, a mouse released outside the viewport fires no
    // window pointerup, stranding the prior pointer. A fresh mouse-down
    // must reset that so the next drag orbits rather than mis-promoting
    // to a two-pointer pinch.
    const { canvas, rec } = makeCanvas();
    const sink = makeSink();
    attachOrbitControls(canvas as unknown as HTMLCanvasElement, sink.emit);

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

    expect(sink.kinds()).not.toContain('pinchAnchor');
    expect(sink.events).toContainEqual({ kind: 'dragMove', mode: 'orbit', xPx: 160, yPx: 100 });
  });

  it('teardown removes the window listeners it added', () => {
    const { canvas, rec } = makeCanvas();
    const sink = makeSink();
    const detach = attachOrbitControls(canvas as unknown as HTMLCanvasElement, sink.emit);

    detach();

    expect(rec.listeners).toHaveLength(0);
    expect(win.listeners).toHaveLength(0);

    // A post-detach gesture must emit nothing.
    rec.fire('pointerdown', touchDown(1, 100, 100));
    win.fire('pointermove', { pointerId: 1, clientX: 150, clientY: 100 });
    expect(sink.events).toHaveLength(0);
  });
});

describe('attachOrbitControls — gesture boundaries', () => {
  it('emits gestureStart on the first contact only, not on pinch promotion', () => {
    // The drain turns gestureStart into seed + beginDrag + cancelCameraTween;
    // a second finger changes the mode but does not start a new gesture.
    const { canvas, rec } = makeCanvas();
    const sink = makeSink();
    attachOrbitControls(canvas as unknown as HTMLCanvasElement, sink.emit);

    rec.fire('pointerdown', touchDown(1, 100, 100));
    rec.fire('pointerdown', touchDown(2, 200, 200));

    expect(sink.kinds().filter((k) => k === 'gestureStart')).toHaveLength(1);
    // The promotion baselines the pinch instead.
    expect(sink.events).toContainEqual({
      kind: 'pinchAnchor',
      distPx: Math.sqrt(100 * 100 + 100 * 100),
    });
  });

  it('emits gestureEnd only when the LAST contact lifts', () => {
    // Gesture end commits the pose and ends the Redux drag — a pinch where one
    // finger lifts must not commit.
    const { canvas, rec } = makeCanvas();
    const sink = makeSink();
    attachOrbitControls(canvas as unknown as HTMLCanvasElement, sink.emit);

    rec.fire('pointerdown', touchDown(1, 100, 100));
    rec.fire('pointerdown', touchDown(2, 200, 200));
    win.fire('pointerup', { pointerId: 1, clientX: 100, clientY: 100 });
    expect(sink.kinds()).not.toContain('gestureEnd');

    win.fire('pointerup', { pointerId: 2, clientX: 200, clientY: 200 });
    expect(sink.kinds().filter((k) => k === 'gestureEnd')).toHaveLength(1);
  });

  it('flags a wheel by whether a pointer is down (which register owns the zoom)', () => {
    const { canvas, rec } = makeCanvas();
    const sink = makeSink();
    attachOrbitControls(canvas as unknown as HTMLCanvasElement, sink.emit);

    // The pixel rides along on both: at rest it is the only cursor position
    // the surface arm has to aim its zoom at (spec §12-R4).
    rec.fire('wheel', { deltaY: 100, clientX: 640, clientY: 360, preventDefault: vi.fn() });
    expect(sink.events).toContainEqual({
      kind: 'wheel',
      deltaY: 100,
      duringGesture: false,
      xPx: 640,
      yPx: 360,
    });

    rec.fire('pointerdown', touchDown(1, 100, 100));
    rec.fire('wheel', { deltaY: 100, clientX: 641, clientY: 361, preventDefault: vi.fn() });
    expect(sink.events).toContainEqual({
      kind: 'wheel',
      deltaY: 100,
      duringGesture: true,
      xPx: 641,
      yPx: 361,
    });
  });

  it('emits pinch samples only while two contacts are down', () => {
    const { canvas, rec } = makeCanvas();
    const sink = makeSink();
    attachOrbitControls(canvas as unknown as HTMLCanvasElement, sink.emit);

    rec.fire('pointerdown', touchDown(1, 0, 0));
    rec.fire('pointerdown', touchDown(2, 10, 0));
    win.fire('pointermove', { pointerId: 2, clientX: 30, clientY: 0 });
    expect(sink.events).toContainEqual({ kind: 'pinchMove', distPx: 30 });

    // One finger lifts: the gesture is over, and the survivor must not be
    // promoted back to orbit (which would feel like a snap on a grip change).
    win.fire('pointerup', { pointerId: 1, clientX: 0, clientY: 0 });
    const before = sink.events.length;
    win.fire('pointermove', { pointerId: 2, clientX: 90, clientY: 0 });
    expect(sink.events).toHaveLength(before);
  });
});
