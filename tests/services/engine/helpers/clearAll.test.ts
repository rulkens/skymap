// tests/services/engine/helpers/clearAll.test.ts
/**
 * clearAll — unified dismiss helper (InfoCard × / Esc).
 *
 * Asserts:
 *   1. setSelected(null) + setFocused(null) always fire (setters own
 *      their own dedupe and render wake — callers don't guard).
 *   2. Focus is cleared so dismissing collapses the cluster-focus fade
 *      (distinct from a bare empty-space click, which only deselects).
 */

import { describe, it, expect, vi } from 'vitest';
import { clearAll } from '../../../../src/services/engine/helpers/clearAll';
import type { SelectionSubsystem } from '../../../../src/@types/engine/subsystems/SelectionSubsystem';
import type { FocusableTarget } from '../../../../src/@types/engine/FocusableTarget';

function makeSelection(): Pick<SelectionSubsystem, 'setSelected' | 'setFocused'> & {
  setSelected: ReturnType<typeof vi.fn<(target: FocusableTarget | null) => void>>;
  setFocused: ReturnType<typeof vi.fn<(target: FocusableTarget | null) => void>>;
} {
  return {
    setSelected: vi.fn<(target: FocusableTarget | null) => void>(),
    setFocused: vi.fn<(target: FocusableTarget | null) => void>(),
  };
}

describe('clearAll', () => {
  it('always calls setSelected(null) and setFocused(null)', () => {
    // Both setters own their own dedupe — callers pass null unconditionally.
    const sel = makeSelection();
    clearAll(sel as unknown as SelectionSubsystem);
    expect(sel.setSelected).toHaveBeenCalledWith(null);
    expect(sel.setFocused).toHaveBeenCalledWith(null);
  });

  it('calls both setters so focus collapses alongside selection', () => {
    // Dismissing must clear the cluster-fade focus slot, not just deselect.
    const sel = makeSelection();
    clearAll(sel as unknown as SelectionSubsystem);
    expect(sel.setSelected).toHaveBeenCalledTimes(1);
    expect(sel.setFocused).toHaveBeenCalledTimes(1);
  });
});
