/**
 * buildAllBins — stellar-mass wiring smoke test.
 *
 * `recordsToCloud` fills `cloud.log10StellarMass` with a stopgap NaN column
 * (Task 3). This test pins the wiring that replaces it: the estimator must
 * be fed the *adopted* distance — the same `Math.hypot(x, y, z)` the loop
 * bakes into `cloud.positions`, not a distance recomputed independently —
 * and the right per-source mag slots. The SDSS case is allowed to call
 * `estimateLog10StellarMass` itself: the property under test is that
 * `recordsToCloud` wires the right inputs to it, not the formula (pinned
 * independently by `estimateLog10StellarMass.test.ts`).
 */

import { describe, it, expect } from 'vitest';
import { recordsToCloud } from '../../tools/catalog/buildAllBins';
import { estimateLog10StellarMass } from '../../tools/catalog/estimateLog10StellarMass';
import type { ParsedRecord } from '../../tools/parsers/common';
import { Source } from '../../src/data/sources';
import { encodeGalaxyCatalog } from '../../src/data/galaxyCatalog/galaxyCatalogFormat';

function record(source: ParsedRecord['source'], objID: bigint): ParsedRecord {
  return {
    source,
    objID,
    ra: 185.3,
    dec: 12.7,
    z: 0.02,
    spectroscopicZ: 0.02,
    magU: 18.2,
    magG: 17.5,
    magR: 16.8,
    magI: 16.3,
    magZ: 16.0,
    axisRatio: null,
    positionAngleDeg: null,
    diameterKpc: null,
    classByte: 0,
    parentSurveyByte: 0,
  };
}

describe('buildAllBins — stellar-mass wiring', () => {
  const records = [record(Source.SDSS, 1n), record(Source.Milliquas, 2n)];

  it('an SDSS row gets a finite stellar mass consistent with its baked distance', () => {
    const cloud = recordsToCloud(records);
    expect(Number.isFinite(cloud.log10StellarMass[0])).toBe(true);
    const adoptedDistMpc = Math.hypot(
      cloud.positions[0]!,
      cloud.positions[1]!,
      cloud.positions[2]!,
    );
    const expected = estimateLog10StellarMass({
      source: Source.SDSS,
      magU: records[0]!.magU,
      magG: records[0]!.magG,
      magR: records[0]!.magR,
      magI: records[0]!.magI,
      magZ: records[0]!.magZ,
      distMpc: adoptedDistMpc,
    });
    expect(cloud.log10StellarMass[0]).toBeCloseTo(expected, 5);
  });

  it('a Milliquas row gets NaN', () => {
    const cloud = recordsToCloud(records);
    expect(Number.isNaN(cloud.log10StellarMass[1])).toBe(true);
  });

  it('the mass-is-estimated bit rides the encoded flags byte', () => {
    const cloud = recordsToCloud(records);
    const buf = encodeGalaxyCatalog(cloud);
    const bytes = new Uint8Array(buf);
    const flagsSdss = bytes[16 + 0 * 64 + 54]!;
    const flagsMilliquas = bytes[16 + 1 * 64 + 54]!;
    expect((flagsSdss >> 2) & 1).toBe(1);
    expect((flagsMilliquas >> 2) & 1).toBe(0);
  });
});
