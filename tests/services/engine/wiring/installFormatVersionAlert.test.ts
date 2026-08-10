/**
 * installFormatVersionAlert — unit tests.
 *
 * Mirrors installSlotReadyWake.test.ts: a hand-rolled fake slot whose
 * `subscribe` stores the callback, plus an `emit` helper to drive it through
 * states. Three invariants:
 *   - a `FormatVersionError` slot error dispatches the mapped status;
 *   - any other slot error is ignored (no message-string sniffing);
 *   - every family fails at once after a version bump, so only one dispatch
 *     reaches the caller, not one per slot.
 */

import { describe, it, expect, vi } from 'vitest';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { EngineStatus } from '../../../../src/@types/engine/EngineStatus';
import { installFormatVersionAlert } from '../../../../src/services/engine/wiring/installFormatVersionAlert';
import { FormatVersionError } from '../../../../src/data/formatVersionError';
import { HttpError } from '../../../../src/services/loading/fetchWithProgress';

// Hand-rolled fake slot: `subscribe(fn)` stores the callback, `emit(state)`
// drives it — no real AssetSlot machinery needed for this pure fan-in test.
function fakeSlot(name: string): AssetSlot<unknown, unknown> & {
  emit: (s: LoadState<unknown>) => void;
} {
  let captured: ((s: LoadState<unknown>) => void) | undefined;
  return {
    name,
    load: vi.fn(),
    current: () => null,
    state: () => ({ kind: 'idle' }),
    subscribe: (fn) => {
      captured = fn;
      return () => {};
    },
    lastRequest: () => null,
    startedAtMs: () => null,
    forceReload: vi.fn(),
    cancel: vi.fn(),
    release: vi.fn(),
    emit(s: LoadState<unknown>) {
      captured?.(s);
    },
  };
}

describe('installFormatVersionAlert', () => {
  it('dispatches a format-version error status when a slot fails to decode', () => {
    const dispatch = vi.fn<(status: EngineStatus) => void>();
    const slot = fakeSlot('sdss');
    const allSlots = new Map([['sdss', slot]]);

    installFormatVersionAlert(dispatch, allSlots);

    const error = new FormatVersionError(
      'galaxy catalog',
      8,
      9,
      'unsupported version: 8 — please regenerate the .bin via "npm run build-tiers"',
    );
    slot.emit({ kind: 'error', req: {}, error, finalAttempt: 1 });

    expect(dispatch).toHaveBeenCalledExactlyOnceWith({
      kind: 'error',
      message: error.message,
      cause: 'format-version',
    });
  });

  it('ignores non-version slot errors', () => {
    const dispatch = vi.fn<(status: EngineStatus) => void>();
    const slot = fakeSlot('sdss');
    const allSlots = new Map([['sdss', slot]]);

    installFormatVersionAlert(dispatch, allSlots);

    slot.emit({
      kind: 'error',
      req: {},
      error: new HttpError(500, '/data/sdss.bin'),
      finalAttempt: 1,
    });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('dispatches once even when every slot reports the same mismatch', () => {
    const dispatch = vi.fn<(status: EngineStatus) => void>();
    const slotA = fakeSlot('sdss');
    const slotB = fakeSlot('twomrs');
    const slotC = fakeSlot('glade');
    const allSlots = new Map([
      ['sdss', slotA],
      ['twomrs', slotB],
      ['glade', slotC],
    ]);

    installFormatVersionAlert(dispatch, allSlots);

    const mkError = () =>
      new FormatVersionError(
        'galaxy catalog',
        8,
        9,
        'unsupported version: 8 — please regenerate the .bin via "npm run build-tiers"',
      );
    slotA.emit({ kind: 'error', req: {}, error: mkError(), finalAttempt: 1 });
    slotB.emit({ kind: 'error', req: {}, error: mkError(), finalAttempt: 1 });
    slotC.emit({ kind: 'error', req: {}, error: mkError(), finalAttempt: 1 });

    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
