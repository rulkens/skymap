/**
 * Tests for the render scheduler — the tiny coalescing rAF wrapper that
 * powers Skymap's render-on-demand loop.
 *
 * The scheduler is intentionally trivial (one boolean + one rAF token);
 * the value of these tests is in pinning down the *contract* so future
 * refactors don't break the engine's "frame fires exactly once per
 * dirty-mark" guarantee.
 *
 * We inject a fake rAF that captures the queued callback into an array
 * rather than firing it immediately — this lets each test step the
 * "frame" forward deterministically.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRenderScheduler } from '../../../../src/services/engine/subsystems/renderScheduler';
import { MAX_FRAMES_IN_FLIGHT } from '../../../../src/data/rendering/maxFramesInFlight';

/**
 * Build a fake rAF / cAF pair that captures pending callbacks in an
 * array.  Tests pop the array to "fire a frame".  Returns the install
 * pair plus a `flush()` helper that runs every queued callback in FIFO
 * order — useful for tests that don't care about per-frame stepping.
 */
function makeFakeRaf() {
  let nextId = 1;
  const queue: Array<{ id: number; cb: FrameRequestCallback }> = [];
  const rafImpl: typeof requestAnimationFrame = (cb) => {
    const id = nextId++;
    queue.push({ id, cb });
    return id;
  };
  const cafImpl: typeof cancelAnimationFrame = (id) => {
    const idx = queue.findIndex((entry) => entry.id === id);
    if (idx >= 0) queue.splice(idx, 1);
  };
  function fireOne(): void {
    const entry = queue.shift();
    if (!entry) throw new Error('fakeRaf: no callbacks queued');
    entry.cb(performance.now());
  }
  function pendingCount(): number {
    return queue.length;
  }
  return { rafImpl, cafImpl, fireOne, pendingCount };
}

/**
 * Build a fake setTimeout / clearTimeout pair backing `requestIdleFrame`. Like
 * the rAF fake, pending timers are captured rather than fired — `fireTimer()`
 * runs the oldest one so idle-tick behaviour is deterministic.
 */
function makeFakeTimers() {
  let nextId = 1;
  const queue: Array<{ id: number; cb: () => void }> = [];
  const setTimeoutImpl = ((cb: () => void) => {
    const id = nextId++;
    queue.push({ id, cb });
    return id;
  }) as unknown as typeof setTimeout;
  const clearTimeoutImpl = ((id: number) => {
    const idx = queue.findIndex((entry) => entry.id === id);
    if (idx >= 0) queue.splice(idx, 1);
  }) as unknown as typeof clearTimeout;
  function fireTimer(): void {
    const entry = queue.shift();
    if (!entry) throw new Error('fakeTimers: no timers queued');
    entry.cb();
  }
  function pendingCount(): number {
    return queue.length;
  }
  return { setTimeoutImpl, clearTimeoutImpl, fireTimer, pendingCount };
}

describe('createRenderScheduler', () => {
  it('coalesces multiple requestRender calls before the frame fires', () => {
    const fake = makeFakeRaf();
    const onFrame = vi.fn();
    const sched = createRenderScheduler({
      onFrame,
      rafImpl: fake.rafImpl,
      cafImpl: fake.cafImpl,
    });
    sched.requestRender();
    sched.requestRender();
    sched.requestRender();
    expect(fake.pendingCount()).toBe(1);
    fake.fireOne();
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  it('a requestRender during the frame body re-schedules the next frame', () => {
    // This simulates the engine's "still animating" tail: onFrame calls
    // requestRender() at the end if a tween is in flight.
    const fake = makeFakeRaf();
    let stillAnimating = true;
    const onFrame = vi.fn(() => {
      if (stillAnimating) sched.requestRender();
    });
    const sched = createRenderScheduler({
      onFrame,
      rafImpl: fake.rafImpl,
      cafImpl: fake.cafImpl,
    });

    sched.requestRender();
    fake.fireOne(); // frame 1 — schedules frame 2
    expect(fake.pendingCount()).toBe(1);
    fake.fireOne(); // frame 2 — schedules frame 3
    expect(fake.pendingCount()).toBe(1);

    // Animation ends.
    stillAnimating = false;
    fake.fireOne(); // frame 3 — does NOT schedule another
    expect(fake.pendingCount()).toBe(0);
    expect(onFrame).toHaveBeenCalledTimes(3);
  });

  it('destroy drops a queued frame and lets the loop sleep again', () => {
    const fake = makeFakeRaf();
    const onFrame = vi.fn();
    const sched = createRenderScheduler({
      onFrame,
      rafImpl: fake.rafImpl,
      cafImpl: fake.cafImpl,
    });
    sched.requestRender();
    expect(fake.pendingCount()).toBe(1);
    sched.destroy();
    expect(fake.pendingCount()).toBe(0);
    // Subsequent requestRender works normally.
    sched.requestRender();
    expect(fake.pendingCount()).toBe(1);
  });

  it('requestIdleFrame arms one timer that requests a single frame when it fires', () => {
    const fake = makeFakeRaf();
    const timers = makeFakeTimers();
    const onFrame = vi.fn();
    const sched = createRenderScheduler({
      onFrame,
      rafImpl: fake.rafImpl,
      cafImpl: fake.cafImpl,
      setTimeoutImpl: timers.setTimeoutImpl,
      clearTimeoutImpl: timers.clearTimeoutImpl,
    });

    sched.requestIdleFrame(3000);
    // Arming does NOT queue a frame — the loop stays asleep until the timer fires.
    expect(timers.pendingCount()).toBe(1);
    expect(fake.pendingCount()).toBe(0);

    timers.fireTimer();
    expect(fake.pendingCount()).toBe(1);
    fake.fireOne();
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  it('requestIdleFrame does not stack timers — one pending at a time', () => {
    const fake = makeFakeRaf();
    const timers = makeFakeTimers();
    const sched = createRenderScheduler({
      onFrame: vi.fn(),
      rafImpl: fake.rafImpl,
      cafImpl: fake.cafImpl,
      setTimeoutImpl: timers.setTimeoutImpl,
      clearTimeoutImpl: timers.clearTimeoutImpl,
    });

    sched.requestIdleFrame(3000);
    sched.requestIdleFrame(3000);
    sched.requestIdleFrame(3000);
    expect(timers.pendingCount()).toBe(1);
  });

  it('requestIdleFrame is ignored while a rAF frame is already queued', () => {
    const fake = makeFakeRaf();
    const timers = makeFakeTimers();
    const sched = createRenderScheduler({
      onFrame: vi.fn(),
      rafImpl: fake.rafImpl,
      cafImpl: fake.cafImpl,
      setTimeoutImpl: timers.setTimeoutImpl,
      clearTimeoutImpl: timers.clearTimeoutImpl,
    });

    sched.requestRender(); // loop already awake
    sched.requestIdleFrame(3000);
    expect(timers.pendingCount()).toBe(0);
  });

  it('destroy clears a pending idle timer', () => {
    const fake = makeFakeRaf();
    const timers = makeFakeTimers();
    const sched = createRenderScheduler({
      onFrame: vi.fn(),
      rafImpl: fake.rafImpl,
      cafImpl: fake.cafImpl,
      setTimeoutImpl: timers.setTimeoutImpl,
      clearTimeoutImpl: timers.clearTimeoutImpl,
    });

    sched.requestIdleFrame(3000);
    expect(timers.pendingCount()).toBe(1);
    sched.destroy();
    expect(timers.pendingCount()).toBe(0);
  });

  describe('nextFrame', () => {
    it('nextFrame resolves only after onFrame has run', async () => {
      const fake = makeFakeRaf();
      const order: string[] = [];
      const sched = createRenderScheduler({
        onFrame: () => order.push('frame'),
        rafImpl: fake.rafImpl,
        cafImpl: fake.cafImpl,
      });

      const p = sched.nextFrame().then(() => order.push('resolved'));
      await Promise.resolve();
      expect(order).toEqual([]);
      fake.fireOne();
      await p;
      expect(order).toEqual(['frame', 'resolved']);
    });

    it('nextFrame still resolves when onFrame throws', async () => {
      const fake = makeFakeRaf();
      const sched = createRenderScheduler({
        onFrame: () => {
          throw new Error('frame failed');
        },
        rafImpl: fake.rafImpl,
        cafImpl: fake.cafImpl,
      });

      const p = sched.nextFrame();
      expect(() => fake.fireOne()).toThrow('frame failed');
      await p;
    });

    it('nextFrame requests a render when none is queued', () => {
      const fake = makeFakeRaf();
      const sched = createRenderScheduler({
        onFrame: vi.fn(),
        rafImpl: fake.rafImpl,
        cafImpl: fake.cafImpl,
      });

      void sched.nextFrame();
      expect(fake.pendingCount()).toBe(1);
    });

    it('concurrent nextFrame callers share one frame', async () => {
      const fake = makeFakeRaf();
      const sched = createRenderScheduler({
        onFrame: vi.fn(),
        rafImpl: fake.rafImpl,
        cafImpl: fake.cafImpl,
      });

      const both = Promise.all([sched.nextFrame(), sched.nextFrame()]);
      expect(fake.pendingCount()).toBe(1);
      fake.fireOne();
      await both;
    });

    it('nextFrame called inside onFrame waits for the following frame', async () => {
      const fake = makeFakeRaf();
      let inner: Promise<void> | undefined;
      let settled = false;
      const sched = createRenderScheduler({
        onFrame: () => {
          inner ??= sched.nextFrame().then(() => {
            settled = true;
          });
        },
        rafImpl: fake.rafImpl,
        cafImpl: fake.cafImpl,
      });

      sched.requestRender();
      fake.fireOne();
      await Promise.resolve();
      expect(settled).toBe(false);
      fake.fireOne();
      await inner;
      expect(settled).toBe(true);
    });
  });

  describe('frames in flight', () => {
    /** A scheduler whose every frame's GPU work stays pending until the test settles it. */
    function makeCapped() {
      const fake = makeFakeRaf();
      const onFrame = vi.fn();
      const pending: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];
      const sched = createRenderScheduler({
        onFrame,
        frameWorkDone: () =>
          new Promise<void>((resolve, reject) => pending.push({ resolve, reject })),
        rafImpl: fake.rafImpl,
        cafImpl: fake.cafImpl,
      });
      function saturate(): void {
        for (let i = 0; i < MAX_FRAMES_IN_FLIGHT; i++) {
          sched.requestRender();
          fake.fireOne();
        }
      }
      return { fake, onFrame, pending, sched, saturate };
    }
    // `.then(release, release)` settles one microtask after the promise does.
    const settle = () => new Promise<void>((resolve) => setTimeout(resolve));

    it('holds the frame at the cap and runs it once a slot frees', async () => {
      const { fake, onFrame, pending, sched, saturate } = makeCapped();
      saturate();

      sched.requestRender();
      fake.fireOne();
      expect(onFrame).toHaveBeenCalledTimes(MAX_FRAMES_IN_FLIGHT);
      // Parked, not spinning: no rAF until the GPU reports a finished frame.
      expect(fake.pendingCount()).toBe(0);

      pending[0]?.resolve();
      await settle();
      expect(fake.pendingCount()).toBe(1);
      fake.fireOne();
      expect(onFrame).toHaveBeenCalledTimes(MAX_FRAMES_IN_FLIGHT + 1);
    });

    it('a finished frame does not wake a loop that owes no frame', async () => {
      const { fake, pending, saturate } = makeCapped();
      saturate();
      for (const frame of pending) frame.resolve();
      await settle();
      expect(fake.pendingCount()).toBe(0);
    });

    it('a rejected completion still frees its slot', async () => {
      const { fake, onFrame, pending, sched, saturate } = makeCapped();
      saturate();
      sched.requestRender();
      fake.fireOne();

      pending[0]?.reject(new Error('device lost'));
      await settle();
      fake.fireOne();
      expect(onFrame).toHaveBeenCalledTimes(MAX_FRAMES_IN_FLIGHT + 1);
    });

    it('a held tick leaves nextFrame waiters for the frame that really runs', async () => {
      const { fake, pending, sched, saturate } = makeCapped();
      saturate();
      let resolved = false;
      const waiter = sched.nextFrame().then(() => {
        resolved = true;
      });
      fake.fireOne(); // held
      await settle();
      expect(resolved).toBe(false);

      pending[0]?.resolve();
      await settle();
      fake.fireOne();
      await waiter;
    });

    it('destroy drops the owed frame, so a late completion queues nothing', async () => {
      const { fake, pending, sched, saturate } = makeCapped();
      saturate();
      sched.requestRender();
      fake.fireOne();
      sched.destroy();

      pending[0]?.resolve();
      await settle();
      expect(fake.pendingCount()).toBe(0);
    });

    it('a frame that submitted nothing takes no slot', () => {
      const fake = makeFakeRaf();
      const onFrame = vi.fn();
      const sched = createRenderScheduler({
        onFrame,
        frameWorkDone: () => null,
        rafImpl: fake.rafImpl,
        cafImpl: fake.cafImpl,
      });
      for (let i = 0; i < MAX_FRAMES_IN_FLIGHT + 1; i++) {
        sched.requestRender();
        fake.fireOne();
      }
      expect(onFrame).toHaveBeenCalledTimes(MAX_FRAMES_IN_FLIGHT + 1);
    });
  });
});
