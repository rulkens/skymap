import { describe, it, expect, vi } from 'vitest';

import { missionTrailsPass } from '../../../../src/layers/missions/passes/missionTrailsPass';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { FadeId } from '../../../../src/@types/animation/FadeId';

vi.mock('../../../../src/utils/scene/spacecraftPresent', () => ({
  spacecraftPresent: () => true,
}));

const ctx = { cam: { distance: 0 }, snapshot: { nowMs: 0, simDays: 0 } } as never;

// The fade stub answers only for the handle kind it is given, so a pass reading the
// wrong kind (orbitTrails) sees 0 and the test fails.
function stateWith(opts: { orbit: boolean; mission: boolean; fadeKind: FadeId['kind'] }) {
  return {
    settings: { orbitTrails: { enabled: opts.orbit }, missions: { trails: opts.mission } },
    subsystems: { fades: { opacityOf: (h: FadeId) => (h.kind === opts.fadeKind ? 1 : 0) } },
  } as unknown as EngineState;
}

const pass = missionTrailsPass({ renderer: {} as never });

describe('missionTrailsPass.enabled', () => {
  it('follows missions.trails alone, not orbitTrails', () => {
    const on = stateWith({ orbit: false, mission: true, fadeKind: 'missionTrails' });
    expect(pass.enabled(on, ctx, null as never)).toBe(true);
    const off = stateWith({ orbit: true, mission: false, fadeKind: 'orbitTrails' });
    expect(pass.enabled(off, ctx, null as never)).toBe(false);
  });
});
