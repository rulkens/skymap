/**
 * The settings-write recompute, over the real entries and settings reducer with a spied
 * registry stub: which identities it moves, how it moves them, and the one-wake rule.
 */

import { describe, expect, it, vi } from 'vitest';

import { APP_VISIBILITY } from '../../../../src/compositions/appVisibility';
import {
  FADE_IN_DURATION_MS,
  FADE_OUT_DURATION_MS,
} from '../../../../src/services/animation/fadeController';
import { syncVisibilityTargets } from '../../../../src/services/engine/wiring/syncVisibilityTargets';
import { INITIAL_SETTINGS } from '../../../../src/state/settings/initialSettings';
import { setVisibility } from '../../../../src/state/settings/setVisibilityAction';
import settingsReducer from '../../../../src/state/settings/settingsReducer';
import type { FadeIdentity } from '../../../../src/@types/animation/FadeIdentity';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { SetVisibilityPayload } from '../../../../src/@types/settings/SetVisibilityPayload';

function makeState(...writes: SetVisibilityPayload[]) {
  const fadeTo = vi.fn<(id: FadeIdentity, target: number, dur?: number) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const setImmediate = vi.fn<(id: FadeIdentity, v: number) => void>();
  // null never matches a real 0/1 target, so every identity is issued unless a test holds one.
  const targetOf = vi.fn<(id: FadeIdentity) => number | null>(() => null);
  const requestRender = vi.fn<() => void>();
  const state = {
    settings: writes.reduce((s, p) => settingsReducer(s, setVisibility(p)), INITIAL_SETTINGS),
    subsystems: { fades: { fadeTo, setImmediate, targetOf }, scheduler: { requestRender } },
    visibilityEntries: APP_VISIBILITY,
    visibilityGates: new Map(),
  } as unknown as EngineState;
  return { state, fadeTo, setImmediate, targetOf, requestRender };
}

const flowOff = { cluster: 'flow', field: 'enabled', on: false } as const;

describe('syncVisibilityTargets', () => {
  it('does not re-issue a target already held', () => {
    const { state, fadeTo, targetOf } = makeState(flowOff);
    targetOf.mockReturnValue(0);
    syncVisibilityTargets(state, { animate: true });
    expect(fadeTo.mock.calls.map(([id]) => id.address)).not.toContain('flow');
  });

  it('retargets an in-flight fade whose switch flipped', () => {
    const { state, fadeTo, targetOf } = makeState(flowOff);
    targetOf.mockReturnValue(1);
    syncVisibilityTargets(state, { animate: true });
    expect(fadeTo).toHaveBeenCalledWith({ address: 'flow' }, 0, FADE_OUT_DURATION_MS);
  });

  it('threads durationMs to every animated fadeTo', () => {
    const { state, fadeTo } = makeState();
    syncVisibilityTargets(state, { animate: true, durationMs: 750 });
    expect(fadeTo.mock.calls.length).toBeGreaterThan(0);
    expect(fadeTo.mock.calls.filter(([, , dur]) => dur !== 750)).toEqual([]);
    expect(750).not.toBe(FADE_IN_DURATION_MS);
  });

  it('a snap batch wakes once, an animated one never', () => {
    const snap = makeState();
    syncVisibilityTargets(snap.state, { animate: false });
    expect(snap.fadeTo).not.toHaveBeenCalled();
    expect(snap.setImmediate.mock.calls.length).toBeGreaterThan(1);
    expect(snap.requestRender).toHaveBeenCalledTimes(1);

    const animated = makeState();
    syncVisibilityTargets(animated.state, { animate: true });
    expect(animated.requestRender).not.toHaveBeenCalled();
  });
});
