/**
 * acceptBuiltHarness — the leak this pins: a `createMcpmHarness()` promise that
 * resolves after its `watchSceneSaga` worker was already cancelled (or after a
 * dispose that happened without cancellation at all) must not leave a live,
 * GPU-buffer-holding harness reachable from nowhere.
 */
import { describe, expect, it, vi } from 'vitest';
import { acceptBuiltHarness } from '../../../../../tools/mcpm-workbench/src/state/scene/acceptBuiltHarness';
import type { McpmHarness } from '../../../../../tools/mcpm-workbench/@types/McpmHarness';

function fakeHarness(): McpmHarness {
  return { dispose: vi.fn() } as unknown as McpmHarness;
}

describe('acceptBuiltHarness', () => {
  it('keeps the harness untouched when neither aborted nor stale', () => {
    const harness = fakeHarness();

    const result = acceptBuiltHarness(harness, { epoch: 3 }, 3, { aborted: false });

    expect(result).toBe(harness);
    expect(harness.dispose).not.toHaveBeenCalled();
  });

  it('disposes and returns null when the worker was cancelled (finally already fired)', () => {
    const harness = fakeHarness();

    const result = acceptBuiltHarness(harness, { epoch: 3 }, 3, { aborted: true });

    expect(result).toBeNull();
    expect(harness.dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes and returns null when a newer build already bumped resources.epoch, even without cancellation', () => {
    const harness = fakeHarness();

    const result = acceptBuiltHarness(harness, { epoch: 4 }, 3, { aborted: false });

    expect(result).toBeNull();
    expect(harness.dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes on either condition alone — both aborted AND stale still disposes exactly once', () => {
    const harness = fakeHarness();

    const result = acceptBuiltHarness(harness, { epoch: 4 }, 3, { aborted: true });

    expect(result).toBeNull();
    expect(harness.dispose).toHaveBeenCalledTimes(1);
  });
});
