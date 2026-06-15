/**
 * commitFocus — verifies the union-dispatching entry point routes
 * GalaxyInfo through commitGalaxyFocus and StructureInfo through
 * commitStructureFocus via the COMMIT_FOCUS table keyed on `target.type`.
 *
 * Mocks both underlying commit helpers and asserts the right one was
 * called. Deeper coverage lives in commitGalaxyFocus.test.ts /
 * commitStructureFocus.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { GalaxyInfo } from '../../../../src/@types/engine/GalaxyInfo';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';

const commitGalaxyFocusSpy = vi.fn();
const commitStructureFocusSpy = vi.fn();
const commitMilkyWayFocusSpy = vi.fn();

vi.mock('../../../../src/services/engine/helpers/commitGalaxyFocus', () => ({
  commitGalaxyFocus: (...args: unknown[]) => commitGalaxyFocusSpy(...args),
}));
vi.mock('../../../../src/services/engine/helpers/commitStructureFocus', () => ({
  commitStructureFocus: (...args: unknown[]) => commitStructureFocusSpy(...args),
}));
vi.mock('../../../../src/services/engine/helpers/commitMilkyWayFocus', () => ({
  commitMilkyWayFocus: (...args: unknown[]) => commitMilkyWayFocusSpy(...args),
}));

// Imported AFTER the mocks so commitFocus picks them up.
import { commitFocus } from '../../../../src/services/engine/helpers/commitFocus';
import { MILKY_WAY_INFO } from '../../../../src/data/milkyWay/milkyWayInfo';

function makeFixtures() {
  const state = {} as unknown as EngineState;
  const galaxy = {
    type: 'galaxyCatalog',
    index: 0,
    x: 0,
    y: 0,
    z: 0,
  } as unknown as GalaxyInfo;
  const structure: StructureInfo = {
    type: 'structure',
    id: 'virgo-cluster',
    name: 'Virgo Cluster',
    category: 'cluster',
    worldPos: [0, 0, 0],
    featured: true,
    physicalRadiusMpc: 2,
  };
  return { state, galaxy, structure };
}

describe('commitFocus', () => {
  beforeEach(() => {
    commitGalaxyFocusSpy.mockClear();
    commitStructureFocusSpy.mockClear();
    commitMilkyWayFocusSpy.mockClear();
  });

  it('routes a GalaxyInfo through commitGalaxyFocus', () => {
    const { state, galaxy } = makeFixtures();
    commitFocus(state, galaxy);
    expect(commitGalaxyFocusSpy).toHaveBeenCalledWith(state, galaxy);
    expect(commitStructureFocusSpy).not.toHaveBeenCalled();
  });

  it('routes a StructureInfo through commitStructureFocus', () => {
    const { state, structure } = makeFixtures();
    commitFocus(state, structure);
    expect(commitStructureFocusSpy).toHaveBeenCalledWith(state, structure);
    expect(commitGalaxyFocusSpy).not.toHaveBeenCalled();
  });

  it('routes a milkyWay target to the milkyWay focus path', () => {
    const { state } = makeFixtures();
    commitFocus(state, MILKY_WAY_INFO);
    // The MW helper takes only `state` (singleton — no per-instance data).
    expect(commitMilkyWayFocusSpy).toHaveBeenCalledWith(state);
    expect(commitGalaxyFocusSpy).not.toHaveBeenCalled();
    expect(commitStructureFocusSpy).not.toHaveBeenCalled();
  });
});
