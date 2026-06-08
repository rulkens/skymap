/**
 * commitGalaxyFocus — invariants for the galaxy focus-commit protocol.
 *
 * Parallel to `commitStructureFocus.test.ts`.  The helper is the shared
 * 3-call tail of `focusOn` / `selectFamous` / `selectByAlias`:
 *   1. setSelected(`{kind:'galaxy', source, localIdx}`, info)
 *   2. setFocused(`{kind:'galaxy', source, localIdx}`, info)
 *   3. tweenToGalaxy(state, info)
 *
 * Order is load-bearing — setSelected before setFocused so the
 * InfoCard echo lands before the focus/URL-hash flips, and the tween
 * last so the camera animates on a frame where every other state is
 * consistent.  Both setters own their own callback fan-out
 * (`onSelectChange` / `onFocusChange`), so the helper takes no `cb`.
 *
 * `tweenToGalaxy` is mocked so we can assert call shape without
 * stubbing out the entire camera subsystem (it has its own test
 * suite in `tweenToGalaxy.test.ts`).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { GalaxyInfo } from '../../../../src/@types/engine/GalaxyInfo';

const tweenToGalaxySpy = vi.fn();
vi.mock('../../../../src/services/engine/camera/tweenToGalaxy', () => ({
  tweenToGalaxy: (...args: unknown[]) => tweenToGalaxySpy(...args),
}));

import { commitGalaxyFocus } from '../../../../src/services/engine/helpers/commitGalaxyFocus';
import { Source } from '../../../../src/data/sources';

function makeFixtures() {
  const setSelected = vi.fn();
  const setFocused = vi.fn();
  const state = {
    subsystems: { selection: { setSelected, setFocused } },
  } as unknown as EngineState;
  const info = {
    source: Source.SDSS,
    index: 42,
    diameterKpc: 30,
  } as unknown as GalaxyInfo;
  return { state, info, setSelected, setFocused };
}

describe('commitGalaxyFocus', () => {
  beforeEach(() => {
    tweenToGalaxySpy.mockClear();
  });

  it('fires setSelected → setFocused → tweenToGalaxy in that order', () => {
    const { state, info, setSelected, setFocused } = makeFixtures();

    commitGalaxyFocus(state, info);

    const selection = { kind: 'galaxy', source: Source.SDSS, localIdx: 42 };
    expect(setSelected).toHaveBeenCalledWith(selection, info);
    expect(setFocused).toHaveBeenCalledWith(selection, info);
    expect(tweenToGalaxySpy).toHaveBeenCalledWith(state, info);

    const setSelectedOrder = setSelected.mock.invocationCallOrder[0]!;
    const setFocusedOrder = setFocused.mock.invocationCallOrder[0]!;
    const tweenOrder = tweenToGalaxySpy.mock.invocationCallOrder[0]!;
    expect(setSelectedOrder).toBeLessThan(setFocusedOrder);
    expect(setFocusedOrder).toBeLessThan(tweenOrder);
  });

  it('latches the focus slot so a galaxy focus supersedes a prior cluster focus', () => {
    // Focusing a galaxy must set the focus slot to the galaxy variant —
    // runFrame resolves that to a null structure, collapsing any active
    // cluster-focus fade.  Leaving the slot on a stale cluster would
    // keep the structure faded after flying to a member galaxy.
    const { state, info, setFocused } = makeFixtures();
    commitGalaxyFocus(state, info);
    expect(setFocused).toHaveBeenCalledWith(
      { kind: 'galaxy', source: Source.SDSS, localIdx: 42 },
      info,
    );
  });

  it('forwards info as the prebuiltInfo hint to both setters', () => {
    // The prebuiltInfo escape hatch defends the selectByAlias deep-link
    // race window — the GPU upload hasn't completed but the InfoCard
    // still needs the resolved GalaxyInfo immediately.  Forwarding
    // `info` unconditionally extends that protection to every caller.
    const { state, info, setSelected, setFocused } = makeFixtures();
    commitGalaxyFocus(state, info);
    expect(setSelected.mock.calls[0]![1]).toBe(info);
    expect(setFocused.mock.calls[0]![1]).toBe(info);
  });
});
