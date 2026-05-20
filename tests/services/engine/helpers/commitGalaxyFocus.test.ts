/**
 * commitGalaxyFocus — invariants for the galaxy focus-commit protocol.
 *
 * Parallel to `commitPoiFocus.test.ts`.  The helper is the shared
 * 3-call tail of `focusOn` / `selectFamous` / `selectByAlias`:
 *   1. setSelected(`{kind:'galaxy', source, localIdx}`, info)
 *   2. cb.camera.onFocusChange(info)
 *   3. tweenToGalaxy(state, info)
 *
 * Order is load-bearing — `onFocusChange` drives the URL hash; firing
 * the tween before the React side observes the new focus target lets
 * the camera animate while the hash still points elsewhere.
 *
 * `tweenToGalaxy` is mocked so we can assert call shape without
 * stubbing out the entire camera subsystem (it has its own test
 * suite in `tweenToGalaxy.test.ts`).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
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
  const onFocusChange = vi.fn();
  const state = {
    subsystems: { selection: { setSelected } },
  } as unknown as EngineState;
  const cb = {
    camera: { onFocusChange },
  } as unknown as EngineCallbacks;
  const info = {
    source: Source.SDSS,
    index: 42,
    diameterKpc: 30,
  } as unknown as GalaxyInfo;
  return { state, cb, info, setSelected, onFocusChange };
}

describe('commitGalaxyFocus', () => {
  beforeEach(() => {
    tweenToGalaxySpy.mockClear();
  });

  it('fires setSelected → onFocusChange → tweenToGalaxy in that order', () => {
    const { state, cb, info, setSelected, onFocusChange } = makeFixtures();

    commitGalaxyFocus(state, cb, info);

    expect(setSelected).toHaveBeenCalledWith(
      { kind: 'galaxy', source: Source.SDSS, localIdx: 42 },
      info,
    );
    expect(onFocusChange).toHaveBeenCalledWith(info);
    expect(tweenToGalaxySpy).toHaveBeenCalledWith(state, info);

    const setSelectedOrder = setSelected.mock.invocationCallOrder[0]!;
    const onFocusChangeOrder = onFocusChange.mock.invocationCallOrder[0]!;
    const tweenOrder = tweenToGalaxySpy.mock.invocationCallOrder[0]!;
    expect(setSelectedOrder).toBeLessThan(onFocusChangeOrder);
    expect(onFocusChangeOrder).toBeLessThan(tweenOrder);
  });

  it('forwards info as the prebuiltInfo hint to setSelected', () => {
    // The prebuiltInfo escape hatch defends the selectByAlias deep-link
    // race window — the GPU upload hasn't completed but the InfoCard
    // still needs the resolved GalaxyInfo immediately.  Forwarding
    // `info` unconditionally extends that protection to every caller.
    const { state, cb, info, setSelected } = makeFixtures();
    commitGalaxyFocus(state, cb, info);
    expect(setSelected.mock.calls[0]![1]).toBe(info);
  });

  it('does not crash when cb.camera.onFocusChange is undefined', () => {
    const { state, info } = makeFixtures();
    const cb = { camera: {} } as unknown as EngineCallbacks;

    expect(() => commitGalaxyFocus(state, cb, info)).not.toThrow();
    expect(tweenToGalaxySpy).toHaveBeenCalledWith(state, info);
  });

  it('does not crash when cb.camera is undefined', () => {
    const { state, info } = makeFixtures();
    const cb = {} as unknown as EngineCallbacks;

    expect(() => commitGalaxyFocus(state, cb, info)).not.toThrow();
    expect(tweenToGalaxySpy).toHaveBeenCalledWith(state, info);
  });
});
