/**
 * createDisposableTracker — verifies LIFO teardown + idempotency.
 *
 * GPUBuffer/GPUTexture aren't available under jsdom, so we stand in plain fakes
 * carrying the discriminating method (`destroy` for GPU resources, `dispose`
 * for Disposables) and cast them to the real types. The tracker only inspects
 * those methods, so the fakes exercise the real branching.
 */
import { describe, expect, it, vi } from 'vitest';
import { createDisposableTracker } from '../../../../tools/cosmic-flow/src/engine/gpu/createDisposableTracker';

describe('createDisposableTracker', () => {
  it('track returns the resource it was given', () => {
    const tracker = createDisposableTracker();
    const fake = { destroy: vi.fn() } as unknown as GPUBuffer;
    expect(tracker.track(fake)).toBe(fake);
  });

  it('disposeAll calls destroy on GPU resources in reverse order', () => {
    const tracker = createDisposableTracker();
    const order: string[] = [];
    const first = { destroy: vi.fn(() => order.push('first')) } as unknown as GPUBuffer;
    const second = { destroy: vi.fn(() => order.push('second')) } as unknown as GPUTexture;
    tracker.track(first);
    tracker.track(second);
    tracker.disposeAll();
    expect(order).toEqual(['second', 'first']);
  });

  it('disposeAll calls dispose on Disposable resources', () => {
    const tracker = createDisposableTracker();
    const dispose = vi.fn();
    tracker.track({ dispose });
    tracker.disposeAll();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('disposeAll is idempotent', () => {
    const tracker = createDisposableTracker();
    const destroy = vi.fn();
    const dispose = vi.fn();
    tracker.track({ destroy } as unknown as GPUBuffer);
    tracker.track({ dispose });
    tracker.disposeAll();
    tracker.disposeAll();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
