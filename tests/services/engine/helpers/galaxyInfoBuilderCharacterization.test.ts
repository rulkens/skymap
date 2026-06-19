/**
 * Characterization (golden) test for buildGalaxyInfo BEFORE the extract/build
 * split. This pins the exact GalaxyInfo today's combined builder produces so
 * the split task can prove buildGalaxyInfo(extractGalaxyRow(...)) is byte-equal.
 * Deliberately a snapshot of the WHOLE object: the split must not perturb any
 * derived field (sexagesimal, distance, colours, displayName, urls, provenance).
 */
import { describe, it, expect } from 'vitest';

import { buildGalaxyInfo } from '../../../../src/services/engine/helpers/galaxyInfoBuilder';
import { Source } from '../../../../src/data/sources';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { FamousMetaEntry } from '../../../../src/@types/loading/FamousMetaEntry';

// A single-row cloud at a known position with known photometry. Positions are
// world-space Mpc; values chosen so RA/Dec/distance are non-degenerate.
// Note: objIDs is BigUint64Array (unsigned), not BigInt64Array (signed) — the
// GalaxyCatalog type mandates the unsigned variant because SDSS objIDs are
// positive 64-bit integers that would be misinterpreted as signed.
function makeCloud(over: Partial<GalaxyCatalog> = {}): GalaxyCatalog {
  const count = 1;
  return {
    count,
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

describe('buildGalaxyInfo characterization', () => {
  it('SDSS row golden', () => {
    const info = buildGalaxyInfo(makeCloud(), 0, Source.SDSS);
    expect(info).toMatchSnapshot();
  });

  it('famous row golden', () => {
    const famousMeta: readonly FamousMetaEntry[] = [
      { id: 'm31', names: ['M31', 'NGC 224'], commonName: 'Andromeda Galaxy', description: 'desc', type: 'SBb' },
    ];
    // famousMeta is indexed by the local index (idx=0), not by objID. The cloud
    // objID can be anything — the famous metadata is looked up via famousMeta[idx].
    const info = buildGalaxyInfo(makeCloud({ objIDs: new BigUint64Array([224n]) }), 0, Source.FamousGalaxy, famousMeta);
    expect(info).toMatchSnapshot();
  });
});
