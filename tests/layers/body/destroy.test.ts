import { describe, it, expect, vi } from 'vitest';

import { destroy } from '../../../src/layers/body/destroy';
import { throttleWithTrailingCall } from '../../../src/utils/throttle/throttleWithTrailingCall';
import type { BodyRuntime } from '../../../src/layers/body/@types/BodyRuntime';

describe('body destroy', () => {
  it("drops the readout's pending trailing wake", () => {
    // Bug caught: a wake requested on a scheduler that has already stopped.
    vi.useFakeTimers();
    const requestRender = vi.fn();
    const readoutGate = throttleWithTrailingCall(250, requestRender);
    readoutGate.pass(0);
    readoutGate.pass(16);
    const released = { destroy: () => {}, cancel: () => {} };
    const runtime = new Proxy(
      { readoutGate, textureSlots: new Map(), surfaceTiles: { stream: released } },
      { get: (target, key) => (key in target ? target[key as keyof typeof target] : released) },
    ) as unknown as BodyRuntime;

    destroy(runtime);
    vi.advanceTimersByTime(1000);
    expect(requestRender).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
