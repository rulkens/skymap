import { describe, it, expect, vi } from 'vitest';

import { makeRunFocusTween } from '../../../../src/services/engine/camera/makeRunFocusTween';
import { Source } from '../../../../src/data/sources';
import type { ResolveDeps } from '../../../../src/@types/engine/ResolveDeps';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';

function makeCloud(): GalaxyCatalog {
  return {
    count: 1,
    positions: new Float32Array([10, 20, 30]),
    spectroscopicZ: new Float32Array([0.0123]),
    magU: new Float32Array([18.1]),
    magG: new Float32Array([17.4]),
    magR: new Float32Array([16.9]),
    magI: new Float32Array([16.6]),
    magZ: new Float32Array([16.4]),
    objIDs: new BigUint64Array([1237668n]),
    diameterKpc: new Float32Array([42]),
    axisRatio: new Float32Array([0.7]),
    positionAngleDeg: new Float32Array([35]),
    classByte: new Uint8Array([0]),
    parentSurveyByte: new Uint8Array([0]),
  } as unknown as GalaxyCatalog;
}

const structure = {
  type: 'structure',
  category: 'cluster',
  id: 'abell-2065',
} as unknown as StructureInfo;

const deps: ResolveDeps = {
  catalogs: { get: (s) => (s === Source.SDSS ? makeCloud() : undefined) },
  famousMeta: [],
  structures: { byId: (id) => (id === 'abell-2065' ? structure : null) },
};

describe('makeRunFocusTween', () => {
  function build() {
    const tweens = { galaxyCatalog: vi.fn(), structure: vi.fn(), milkyWay: vi.fn() };
    return { run: makeRunFocusTween(() => deps, tweens), tweens };
  }
  it('galaxy ref → galaxy tween with the resolved row', () => {
    const { run, tweens } = build();
    run({ type: 'galaxyCatalog', source: Source.SDSS, index: 0 });
    expect(tweens.galaxyCatalog).toHaveBeenCalledTimes(1);
    expect(tweens.galaxyCatalog.mock.calls[0]![0]).toMatchObject({
      type: 'galaxyCatalog',
      objId: '1237668',
    });
  });
  it('structure ref → structure tween', () => {
    const { run, tweens } = build();
    run({ type: 'structure', id: 'abell-2065' });
    expect(tweens.structure).toHaveBeenCalledWith(structure);
  });
  it('milkyWay ref → milkyWay tween', () => {
    const { run, tweens } = build();
    run({ type: 'milkyWay' });
    expect(tweens.milkyWay).toHaveBeenCalledTimes(1);
  });
  it('null ref → no tween (focus release)', () => {
    const { run, tweens } = build();
    run(null);
    expect(tweens.galaxyCatalog).not.toHaveBeenCalled();
    expect(tweens.structure).not.toHaveBeenCalled();
    expect(tweens.milkyWay).not.toHaveBeenCalled();
  });
  it('galaxy ref to an unloaded cloud → no tween (resolves null)', () => {
    const { run, tweens } = build();
    run({ type: 'galaxyCatalog', source: Source.Glade, index: 0 });
    expect(tweens.galaxyCatalog).not.toHaveBeenCalled();
  });
});
