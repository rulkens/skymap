/**
 * resolvePick — the merged boundary resolver. Tests the registry-driven
 * dispatch all the way to a RESOLVED `FocusableTarget`:
 *
 *   - null pick → null.
 *   - galaxy catalog code → a GalaxyInfo (via getCloud + resolveGalaxyInfo).
 *   - galaxy code with no loaded cloud → null (tier-swap race guard).
 *   - structure code → a StructureInfo (via byCategory + resolveStructureFromPick).
 *   - structure code with no backing record → null.
 *   - not-a-pickable-surface code → warn + null (never a ghost hit).
 */

import { describe, it, expect, vi } from 'vitest';

import { resolvePick } from '../../../../src/services/engine/helpers/resolvePick';
import { MILKY_WAY_INFO } from '../../../../src/data/milkyWay/milkyWayInfo';
import { Source } from '../../../../src/data/sources';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import type { FamousMetaEntry } from '../../../../src/@types/loading/FamousMetaEntry';
import type { ResolvePickDeps } from '../../../../src/@types/engine/ResolvePickDeps';

/**
 * Build a synthetic `GalaxyCatalog` of `count` rows, all zeroed except objIDs
 * (sequential 1..N).  Mirrors the fixture in `resolveGalaxyInfo.test.ts`.
 */
function makeCloud(count: number): GalaxyCatalog {
  return {
    count,
    objIDs: BigUint64Array.from({ length: count }, (_, i) => BigInt(i + 1)),
    positions: new Float32Array(count * 3),
    magU: new Float32Array(count),
    magG: new Float32Array(count),
    magR: new Float32Array(count),
    magI: new Float32Array(count),
    magZ: new Float32Array(count),
    axisRatio: new Float32Array(count).fill(0.7),
    positionAngleDeg: new Float32Array(count).fill(45),
    diameterKpc: new Float32Array(count).fill(30),
    classByte: new Uint8Array(count),
    parentSurveyByte: new Uint8Array(count),
    spectroscopicZ: new Float32Array(count),
  };
}

const virgo: StructureInfo = {
  type: 'structure',
  id: 'virgo',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  featured: true,
  physicalRadiusMpc: 2,
};

function makeDeps(cloud: GalaxyCatalog | undefined): ResolvePickDeps {
  return {
    getCloud: vi.fn<(source: SourceType) => GalaxyCatalog | undefined>(() => cloud),
    getFamousMeta: vi.fn<() => readonly FamousMetaEntry[]>(() => []),
    structures: {
      byCategory: (cat) => (cat === 'cluster' ? [virgo] : []),
    },
  };
}

describe('resolvePick', () => {
  it('returns null for a null pick', () => {
    expect(resolvePick(null, makeDeps(makeCloud(3)))).toBeNull();
  });

  it('maps a galaxy catalog code to its GalaxyInfo', () => {
    const cloud = makeCloud(3);
    cloud.positions.set([100, 0, 0], 3); // place row 1 on the +x axis
    const target = resolvePick({ sourceCode: Source.SDSS, localIdx: 1 }, makeDeps(cloud));
    expect(target).not.toBeNull();
    expect(target!.type).toBe('galaxyCatalog');
    if (target!.type === 'galaxyCatalog') {
      expect(target!.index).toBe(1);
      expect(target!.source).toBe(Source.SDSS);
    }
  });

  it('returns null for a galaxy code whose cloud is not loaded', () => {
    expect(resolvePick({ sourceCode: Source.SDSS, localIdx: 0 }, makeDeps(undefined))).toBeNull();
  });

  it('maps a structure code to its StructureInfo', () => {
    const target = resolvePick({ sourceCode: Source.Cluster, localIdx: 0 }, makeDeps(undefined));
    expect(target).toBe(virgo);
    expect(target!.type).toBe('structure');
  });

  it('returns null when a structure hit has no backing record', () => {
    expect(
      resolvePick({ sourceCode: Source.Cluster, localIdx: 99 }, makeDeps(undefined)),
    ).toBeNull();
    expect(resolvePick({ sourceCode: Source.Void, localIdx: 0 }, makeDeps(undefined))).toBeNull();
  });

  it('resolves a milkyWay code to MILKY_WAY_INFO', () => {
    // The Milky Way is a singleton — any localIdx maps to the static const.
    expect(resolvePick({ sourceCode: Source.MilkyWay, localIdx: 0 }, makeDeps(undefined))).toBe(
      MILKY_WAY_INFO,
    );
  });

  it('warns and returns null for a non-pickable code', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // 30 is unallocated — no registry entry, so not galaxy catalog nor structure.
      expect(
        resolvePick({ sourceCode: 30 as SourceType, localIdx: 0 }, makeDeps(undefined)),
      ).toBeNull();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
