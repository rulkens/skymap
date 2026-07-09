/**
 * buildAllBins — DESI Deep Field pipeline smoke test.
 *
 * Mirrors `buildAllBins.milliquas.test.ts`'s rationale: walk the parsed-
 * records → `recordsToCloud` hop in isolation, without touching the real
 * 773 MB FITS files on disk. DESI rows carry the GLADE no-measurement
 * orientation shape (axisRatio/positionAngleDeg/diameterKpc all null,
 * same as every parser that lacks a shape measurement) plus a tracer
 * classByte instead of Milliquas's AGN class byte — this test pins that
 * `recordsToCloud`'s fallback-orientation and classByte-copy paths both
 * handle the DESI shape correctly.
 */

import { describe, it, expect } from 'vitest';
import { recordsToCloud } from '../../tools/catalog/buildAllBins';
import type { ParsedRecord } from '../../tools/parsers/common';
import { Source } from '../../src/data/sources';
import { DESI_TRACER_CLASS } from '../../src/data/galaxyCatalog/sourceClass';
import { DEFAULT_GALAXY_DIAMETER_KPC } from '../../src/utils/math/defaultGalaxyDiameterKpc';

/**
 * Builds a DESI-shaped `ParsedRecord` the way `parseDesiClustering` emits
 * one: null orientation/diameter (no shape columns in any LSS clustering
 * file) and a tracer classByte in place of Milliquas's AGN-class byte.
 */
function desiRecord(
  objID: bigint,
  ra: number,
  dec: number,
  z: number,
  tracer: keyof typeof DESI_TRACER_CLASS,
): ParsedRecord {
  return {
    source: Source.DesiDeep,
    objID,
    ra,
    dec,
    z,
    spectroscopicZ: z,
    magU: NaN,
    magG: 20,
    magR: 19.5,
    magI: NaN,
    magZ: NaN,
    axisRatio: null,
    positionAngleDeg: null,
    diameterKpc: null,
    classByte: DESI_TRACER_CLASS[tracer],
    parentSurveyByte: 0,
  };
}

describe('buildAllBins — DESI Deep smoke', () => {
  const records = [
    desiRecord(1n, 233.2, 32.3, 0.07, 'BGS'),
    desiRecord(2n, 233.5, 32.1, 0.7, 'LRG'),
  ];

  it('recordsToCloud applies fallbackOrientation to DESI null-orientation records', () => {
    const cloud = recordsToCloud(records);
    expect(cloud.count).toBe(records.length);
    for (let i = 0; i < cloud.count; i++) {
      // fallbackOrientation's [0,1] axisRatio range is the renderer's
      // invariant — see the equivalent Milliquas assertion.
      expect(Number.isFinite(cloud.axisRatio[i])).toBe(true);
      expect(cloud.axisRatio[i]!).toBeGreaterThanOrEqual(0);
      expect(cloud.axisRatio[i]!).toBeLessThanOrEqual(1);
      expect(Number.isFinite(cloud.positionAngleDeg[i])).toBe(true);
      expect(cloud.diameterKpc[i]).toBe(DEFAULT_GALAXY_DIAMETER_KPC);
    }
  });

  it('DESI records carry classByte through to the cloud', () => {
    const cloud = recordsToCloud(records);
    expect(cloud.classByte[0]).toBe(DESI_TRACER_CLASS.BGS);
    expect(cloud.classByte[1]).toBe(DESI_TRACER_CLASS.LRG);
    // DESI has no Milliquas-style parent-survey signal — every row writes 0.
    expect(cloud.parentSurveyByte[0]).toBe(0);
    expect(cloud.parentSurveyByte[1]).toBe(0);
  });
});
