/**
 * inputBindings — unit tests for the engine's pointer/keyboard/resize
 * listener bag.
 *
 * Vitest in this project runs in `node` (no jsdom), so we hand-roll a
 * minimal EventTarget-style canvas + a stand-in for window's
 * addEventListener/removeEventListener.  We snapshot the listeners that
 * `attachEngineInputs` registers, then drive synthetic events through
 * them and assert the right semantic callbacks fired.
 *
 * Coverage focus areas:
 *   1. Each event maps to its expected callback.
 *   2. Each event also fires `scheduler.requestRender()` at most once.
 *   3. `pointercancel` (a defensive corner case) fires `onPointerUp`.
 *   4. A non-Escape keydown does NOT fire `onEscape`.
 *   5. `detach()` removes every listener it added — a synthetic event
 *      fired after detach must not invoke any callback.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { attachEngineInputs } from '../../../src/services/engine/inputBindings';
import type { RenderScheduler } from '../../../src/services/engine/renderScheduler';

type Listener = (e: unknown) => void;

/**
 * Tiny EventTarget stand-in: we record every (type, handler) pair so
 * the test can fire by type and observe registration / removal.  Real
 * browsers preserve insertion order and de-dupe identical pairs; we
 * don't bother with the de-dupe because the inputBindings code never
 * registers the same pair twice.
 */
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
    // Fire on a copy so handlers detaching themselves don't skip later
    // listeners — the inputBindings code doesn't do that today, but
    // it's the safer pattern for a generic recorder.
    for (const l of [...listeners]) {
      if (l.type === type) l.handler(event);
    }
  }
  return { target, listeners, fire };
}

let canvas: ReturnType<typeof makeRecorder>;
let windowRecorder: ReturnType<typeof makeRecorder>;
let originalWindow: unknown;

const scheduler: RenderScheduler = {
  requestRender: vi.fn(),
  cancelRender: vi.fn(),
  isScheduled: () => false,
};

beforeEach(() => {
  canvas = makeRecorder();
  windowRecorder = makeRecorder();
  // Vitest is configured for `node`, so there is no global `window`.
  // We install a stub on `globalThis` so the inputBindings module's
  // `window.addEventListener` calls land on our recorder.  Saved /
  // restored per-test to keep tests independent.
  const g = globalThis as unknown as Record<string, unknown>;
  originalWindow = g.window;
  g.window = windowRecorder.target;
  vi.mocked(scheduler.requestRender).mockClear();
});

afterEach(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  if (originalWindow === undefined) {
    delete g.window;
  } else {
    g.window = originalWindow;
  }
});

describe('attachEngineInputs', () => {
  it('forwards pointermove to onPointerMove with CSS-pixel coords', () => {
    const onPointerMove = vi.fn();
    attachEngineInputs({
      canvas: canvas.target as unknown as HTMLCanvasElement,
      scheduler,
      onPointerMove,
      onPointerLeave: () => {},
      onPointerDown: () => {},
      onPointerUp: () => {},
      onEscape: () => {},
      onResize: () => {},
    });
    canvas.fire('pointermove', { clientX: 42, clientY: 99 });
    expect(onPointerMove).toHaveBeenCalledWith({ x: 42, y: 99 });
    expect(scheduler.requestRender).toHaveBeenCalledTimes(1);
  });

  it('forwards pointerleave to onPointerLeave', () => {
    const onPointerLeave = vi.fn();
    attachEngineInputs({
      canvas: canvas.target as unknown as HTMLCanvasElement,
      scheduler,
      onPointerMove: () => {},
      onPointerLeave,
      onPointerDown: () => {},
      onPointerUp: () => {},
      onEscape: () => {},
      onResize: () => {},
    });
    canvas.fire('pointerleave', {});
    expect(onPointerLeave).toHaveBeenCalledTimes(1);
    expect(scheduler.requestRender).toHaveBeenCalledTimes(1);
  });

  it('forwards pointerdown to onPointerDown', () => {
    const onPointerDown = vi.fn();
    attachEngineInputs({
      canvas: canvas.target as unknown as HTMLCanvasElement,
      scheduler,
      onPointerMove: () => {},
      onPointerLeave: () => {},
      onPointerDown,
      onPointerUp: () => {},
      onEscape: () => {},
      onResize: () => {},
    });
    canvas.fire('pointerdown', {});
    expect(onPointerDown).toHaveBeenCalledTimes(1);
    expect(scheduler.requestRender).toHaveBeenCalledTimes(1);
  });

  it('forwards window pointerup AND pointercancel to onPointerUp', () => {
    const onPointerUp = vi.fn();
    attachEngineInputs({
      canvas: canvas.target as unknown as HTMLCanvasElement,
      scheduler,
      onPointerMove: () => {},
      onPointerLeave: () => {},
      onPointerDown: () => {},
      onPointerUp,
      onEscape: () => {},
      onResize: () => {},
    });
    windowRecorder.fire('pointerup', {});
    expect(onPointerUp).toHaveBeenCalledTimes(1);
    windowRecorder.fire('pointercancel', {});
    expect(onPointerUp).toHaveBeenCalledTimes(2);
  });

  it('forwards Escape keydown to onEscape and ignores other keys', () => {
    const onEscape = vi.fn();
    attachEngineInputs({
      canvas: canvas.target as unknown as HTMLCanvasElement,
      scheduler,
      onPointerMove: () => {},
      onPointerLeave: () => {},
      onPointerDown: () => {},
      onPointerUp: () => {},
      onEscape,
      onResize: () => {},
    });
    windowRecorder.fire('keydown', { key: 'a' });
    expect(onEscape).not.toHaveBeenCalled();
    windowRecorder.fire('keydown', { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(scheduler.requestRender).toHaveBeenCalledTimes(1);
  });

  it('forwards window resize to onResize', () => {
    const onResize = vi.fn();
    attachEngineInputs({
      canvas: canvas.target as unknown as HTMLCanvasElement,
      scheduler,
      onPointerMove: () => {},
      onPointerLeave: () => {},
      onPointerDown: () => {},
      onPointerUp: () => {},
      onEscape: () => {},
      onResize,
    });
    windowRecorder.fire('resize', {});
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(scheduler.requestRender).toHaveBeenCalledTimes(1);
  });

  it('detach() removes every listener it added', () => {
    const onPointerMove = vi.fn();
    const onResize = vi.fn();
    const bindings = attachEngineInputs({
      canvas: canvas.target as unknown as HTMLCanvasElement,
      scheduler,
      onPointerMove,
      onPointerLeave: () => {},
      onPointerDown: () => {},
      onPointerUp: () => {},
      onEscape: () => {},
      onResize,
    });
    // Sanity check: events fire before detach.
    canvas.fire('pointermove', { clientX: 1, clientY: 2 });
    expect(onPointerMove).toHaveBeenCalledTimes(1);

    bindings.detach();
    // Recorder lists should now be empty for both targets.
    expect(canvas.listeners).toHaveLength(0);
    expect(windowRecorder.listeners).toHaveLength(0);

    // Synthetic events post-detach must not trigger callbacks.
    canvas.fire('pointermove', { clientX: 3, clientY: 4 });
    windowRecorder.fire('resize', {});
    expect(onPointerMove).toHaveBeenCalledTimes(1);
    expect(onResize).not.toHaveBeenCalled();
  });
});
