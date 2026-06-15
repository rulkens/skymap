/**
 * targetEq — value-equality on a FocusableTarget's identity fields.
 *
 * Covers the dedup contract: both-null, one-null, cross-type, and the
 * per-arm identity comparison (galaxy on source+index, structure on id).
 * Fixtures populate only the identity fields + the `type` tag; the
 * helper reads nothing else, so a partial cast is the honest fixture.
 */
import { describe, it, expect } from 'vitest';
import { targetEq } from '../../../../src/services/engine/helpers/targetEq';
import { MILKY_WAY_INFO } from '../../../../src/data/milkyWay/milkyWayInfo';
import type { GalaxyInfo } from '../../../../src/@types/engine/GalaxyInfo';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import { Source } from '../../../../src/data/sources';

function makeGalaxy(source: GalaxyInfo['source'], index: number): GalaxyInfo {
  return { type: 'galaxyCatalog', source, index } as unknown as GalaxyInfo;
}

function makeStructure(id: string): StructureInfo {
  return { type: 'structure', id } as unknown as StructureInfo;
}

describe('targetEq', () => {
  it('both null are equal', () => {
    expect(targetEq(null, null)).toBe(true);
  });

  it('null vs non-null are not equal (both directions)', () => {
    const g = makeGalaxy(Source.SDSS, 0);
    expect(targetEq(null, g)).toBe(false);
    expect(targetEq(g, null)).toBe(false);
  });

  it('galaxy vs structure are not equal', () => {
    expect(targetEq(makeGalaxy(Source.SDSS, 0), makeStructure('virgo'))).toBe(false);
  });

  it('same galaxy (source + index) is equal; differing index is not', () => {
    expect(targetEq(makeGalaxy(Source.SDSS, 7), makeGalaxy(Source.SDSS, 7))).toBe(true);
    expect(targetEq(makeGalaxy(Source.SDSS, 7), makeGalaxy(Source.SDSS, 8))).toBe(false);
  });

  it('differing source is not equal', () => {
    expect(targetEq(makeGalaxy(Source.SDSS, 7), makeGalaxy(Source.Glade, 7))).toBe(false);
  });

  it('same structure id is equal; differing id is not', () => {
    expect(targetEq(makeStructure('virgo'), makeStructure('virgo'))).toBe(true);
    expect(targetEq(makeStructure('virgo'), makeStructure('coma'))).toBe(false);
  });

  it('true for two milkyWay targets (singleton self-equality)', () => {
    expect(targetEq(MILKY_WAY_INFO, MILKY_WAY_INFO)).toBe(true);
  });

  it('false for milkyWay vs a galaxy', () => {
    expect(targetEq(MILKY_WAY_INFO, makeGalaxy(Source.SDSS, 0))).toBe(false);
  });

  it('false for milkyWay vs a structure', () => {
    expect(targetEq(MILKY_WAY_INFO, makeStructure('virgo'))).toBe(false);
  });
});
