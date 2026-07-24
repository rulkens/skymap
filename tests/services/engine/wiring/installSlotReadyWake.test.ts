/**
 * installSlotReadyWake — unit tests.
 *
 * Three invariants:
 *   - every slot gets exactly one `subscribe` call;
 *   - each `ready` transition calls `requestRender` once;
 *   - non-ready transitions (`loading`, `error`, `idle`, `committing`)
 *     never wake — new data only.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import { installSlotReadyWake } from '../../../../src/services/engine/wiring/installSlotReadyWake';

// Stub slot that captures the subscriber passed to `subscribe`.
function stubSlot(name: string): AssetSlot<unknown, unknown> & {
  _fire: (s: LoadState<unknown>) => void;
  subscribeSpy: ReturnType<typeof vi.fn>;
} {
  let captured: ((s: LoadState<unknown>) => void) | undefined;
  const subscribeSpy = vi.fn((fn: (s: LoadState<unknown>) => void) => {
    captured = fn;
    return () => {};
  });
  return {
    name,
    load: vi.fn(),
    current: () => null,
    state: () => ({ kind: 'idle' }),
    subscribe: subscribeSpy,
    lastRequest: () => null,
    startedAtMs: () => null,
    forceReload: vi.fn(),
    cancel: vi.fn(),
    release: vi.fn(),
    _fire(s: LoadState<unknown>) {
      captured?.(s);
    },
    subscribeSpy,
  };
}

describe('installSlotReadyWake', () => {
  let requestRender: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    requestRender = vi.fn<() => void>();
  });

  it('subscribes every slot in the registry exactly once', () => {
    const slotA = stubSlot('slot-a');
    const slotB = stubSlot('slot-b');
    const allSlots = new Map<string, AssetSlot<unknown, unknown>>([
      ['slot-a', slotA],
      ['slot-b', slotB],
    ]);

    installSlotReadyWake(requestRender, allSlots);

    expect(slotA.subscribeSpy).toHaveBeenCalledTimes(1);
    expect(slotB.subscribeSpy).toHaveBeenCalledTimes(1);
  });

  it('wakes the scheduler when any slot transitions to ready', () => {
    const slotA = stubSlot('slot-a');
    const slotB = stubSlot('slot-b');
    const allSlots = new Map<string, AssetSlot<unknown, unknown>>([
      ['slot-a', slotA],
      ['slot-b', slotB],
    ]);

    installSlotReadyWake(requestRender, allSlots);
    expect(requestRender).toHaveBeenCalledTimes(0);

    slotA._fire({ kind: 'ready', req: {}, value: {}, loadedAtMs: 0 });
    expect(requestRender).toHaveBeenCalledTimes(1);

    slotB._fire({ kind: 'ready', req: {}, value: {}, loadedAtMs: 0 });
    expect(requestRender).toHaveBeenCalledTimes(2);
  });

  it('does not wake on non-ready transitions', () => {
    const slot = stubSlot('slot-a');
    const allSlots = new Map<string, AssetSlot<unknown, unknown>>([['slot-a', slot]]);

    installSlotReadyWake(requestRender, allSlots);

    slot._fire({ kind: 'loading', req: {}, loaded: 0, total: 100, attempt: 0 });
    slot._fire({ kind: 'error', req: {}, error: new Error('boom'), finalAttempt: 3 });
    slot._fire({ kind: 'idle' });
    slot._fire({ kind: 'committing', req: {} });

    expect(requestRender).toHaveBeenCalledTimes(0);
  });
});
