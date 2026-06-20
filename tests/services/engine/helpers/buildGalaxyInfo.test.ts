import { describe, it, expect } from 'vitest';

import { extractGalaxyRow } from '../../../../src/services/engine/helpers/extractGalaxyRow';
import { buildGalaxyInfo } from '../../../../src/services/engine/helpers/buildGalaxyInfo';
import { Source } from '../../../../src/data/sources';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { FamousMetaEntry } from '../../../../src/@types/loading/FamousMetaEntry';

// Note: objIDs uses BigUint64Array (unsigned), matching the GalaxyCatalog type.
// The brief listed BigInt64Array (signed) — that would fail tsc; corrected here.
function makeCloud(over: Partial<GalaxyCatalog> = {}): GalaxyCatalog {
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
    ...over,
  };
}

describe('buildGalaxyInfo(extractGalaxyRow(...))', () => {
  it('matches the SDSS golden', () => {
    const info = buildGalaxyInfo(extractGalaxyRow(makeCloud(), 0, Source.SDSS)!);
    expect(info).toMatchSnapshot();
  });

  it('matches the famous golden', () => {
    const famousMeta: readonly FamousMetaEntry[] = [
      {
        id: 'm31',
        names: ['M31', 'NGC 224'],
        commonName: 'Andromeda Galaxy',
        description: 'desc',
        type: 'SBb',
      },
    ];
    const info = buildGalaxyInfo(
      extractGalaxyRow(
        makeCloud({ objIDs: new BigUint64Array([224n]) }),
        0,
        Source.FamousGalaxy,
        famousMeta,
      )!,
    );
    expect(info).toMatchSnapshot();
  });
});
