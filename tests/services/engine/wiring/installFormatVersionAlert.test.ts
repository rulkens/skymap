/**
 * installFormatVersionAlert — unit tests.
 *
 * Mirrors installSlotReadyWake.test.ts: a hand-rolled fake slot whose
 * `subscribe` stores the callback, plus an `emit` helper to drive it through
 * states. Three invariants:
 *   - a `FormatVersionError` slot error dispatches the mapped status AND
 *     `reopenSplash()` — a returning visitor's `seenVersion` already hid the
 *     splash, so the alert needs both to actually reach them;
 *   - any other slot error is ignored (no message-string sniffing);
 *   - every family fails at once after a version bump, so only one alert
 *     (one status dispatch, one reopen) reaches the caller, not one per slot.
 */

import { describe, it, expect, vi } from 'vitest';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { AppDispatch } from '../../../../src/store/types';
import { installFormatVersionAlert } from '../../../../src/services/engine/wiring/installFormatVersionAlert';
import { FormatVersionError } from '../../../../src/data/formatVersionError';
import { HttpError } from '../../../../src/services/loading/fetchWithProgress';
import { engineStatusChanged } from '../../../../src/state/engine/engineSlice';
import { reopenSplash } from '../../../../src/state/ui/uiSlice';

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

// The dispatch mock records actions (like a real store dispatch would); cast
// past the thunk-dispatch overload rather than standing up a real store —
// this test only cares which plain actions land, not middleware behaviour.
function fakeDispatch(): AppDispatch & ReturnType<typeof vi.fn> {
  return vi.fn() as unknown as AppDispatch & ReturnType<typeof vi.fn>;
}

describe('installFormatVersionAlert', () => {
  it('dispatches a format-version error status AND reopens the splash when a slot fails to decode', () => {
    const dispatch = fakeDispatch();
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

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledWith(
      engineStatusChanged({ kind: 'error', message: error.message, cause: 'format-version' }),
    );
    expect(dispatch).toHaveBeenCalledWith(reopenSplash());
  });

  it('ignores non-version slot errors', () => {
    const dispatch = fakeDispatch();
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
    expect(dispatch).not.toHaveBeenCalledWith(reopenSplash());
  });

  it('dispatches once even when every slot reports the same mismatch', () => {
    const dispatch = fakeDispatch();
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

    // One alert = one status dispatch + one reopen, not one pair per slot.
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls.filter((call) => call[0].type === reopenSplash.type)).toHaveLength(
      1,
    );
  });
});
