import { describe, expect, it } from 'vitest';
import { buildPoisFromFamousMeta } from '../../../../src/services/engine/phases/buildPoisFromFamousMeta';
import type { FamousMetaEntry } from '../../../../src/@types/loading/FamousMetaEntry';
import type { GalaxyCatalog } from '../../../../src/@types/data/GalaxyCatalog';

function makeCatalog(positions: number[], diameters: number[]): GalaxyCatalog {
  const count = diameters.length;
  return {
    count,
    objIDs: new BigUint64Array(count),
    positions: new Float32Array(positions),
    magU: new Float32Array(count).fill(NaN),
    magG: new Float32Array(count).fill(NaN),
    magR: new Float32Array(count).fill(NaN),
    magI: new Float32Array(count).fill(NaN),
    magZ: new Float32Array(count).fill(NaN),
    axisRatio: new Float32Array(count).fill(NaN),
    positionAngleDeg: new Float32Array(count).fill(NaN),
    diameterKpc: new Float32Array(diameters),
  };
}

describe('buildPoisFromFamousMeta', () => {
  it('emits one POI per non-pseudo meta entry, with worldPos from the catalog', () => {
    const meta: FamousMetaEntry[] = [
      { id: 'm31', names: ['M31'], commonName: 'Andromeda Galaxy', description: '', type: '' },
      { id: 'm33', names: ['M33'], description: '', type: '' },
    ];
    const catalog = makeCatalog(
      [0.78, 0.1, 0.2, 0.85, 0.05, 0.15], // two points × 3 floats
      [67, 30],
    );
    const pois = buildPoisFromFamousMeta(meta, catalog);
    expect(pois).toHaveLength(2);
    expect(pois[0]!.id).toBe('famous-m31');
    expect(pois[0]!.name).toBe('Andromeda Galaxy');
    expect(pois[0]!.category).toBe('famousGalaxy');
    expect(pois[0]!.worldPos).toEqual([
      catalog.positions[0],
      catalog.positions[1],
      catalog.positions[2],
    ]);
    expect(pois[0]!.minApparentSizePx).toBe(6);
    expect(pois[0]!.apparentDiameterKpc).toBe(67);
    expect(pois[0]!.crosshairSizeMpc).toBeUndefined();
    expect(pois[1]!.id).toBe('famous-m33');
    expect(pois[1]!.name).toBe('M33'); // falls back to last name in names[]
  });

  it('skips pseudo entries (the Milky Way placeholder)', () => {
    const meta: FamousMetaEntry[] = [
      { id: 'mw', names: ['Milky Way'], description: '', type: '', pseudo: true },
      { id: 'm31', names: ['M31'], description: '', type: '' },
    ];
    // Catalog has only one point — pseudo entries don't exist in famous.bin
    // so the meta index does NOT line up with catalog index for pseudo rows.
    // The producer must match by id, not by array position.  (Real meta
    // arrays today happen to contain only non-pseudo entries — the
    // Milky Way placeholder is merged in at the React layer — but the
    // builder defends against the hybrid case anyway.)
    const catalog = makeCatalog([0.78, 0.1, 0.2], [67]);
    const pois = buildPoisFromFamousMeta(meta, catalog);
    expect(pois).toHaveLength(1);
    expect(pois[0]!.id).toBe('famous-m31');
  });

  it('uses commonName when present, then last name, then first name, then id', () => {
    const meta: FamousMetaEntry[] = [
      { id: 'a', names: ['A1', 'A2'], commonName: 'Curated A', description: '', type: '' },
      { id: 'b', names: ['B1', 'B2'], description: '', type: '' },
      { id: 'c', names: ['C1'], description: '', type: '' },
      { id: 'd', names: [], description: '', type: '' },
    ];
    const catalog = makeCatalog([1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0, 0], [10, 10, 10, 10]);
    const pois = buildPoisFromFamousMeta(meta, catalog);
    expect(pois.map((p) => p.name)).toEqual(['Curated A', 'B2', 'C1', 'd']);
  });

  it('returns empty array when meta is empty', () => {
    const catalog = makeCatalog([], []);
    expect(buildPoisFromFamousMeta([], catalog)).toEqual([]);
  });

  it('returns empty array when catalog has zero points', () => {
    const meta: FamousMetaEntry[] = [{ id: 'm31', names: ['M31'], description: '', type: '' }];
    const catalog = makeCatalog([], []);
    expect(buildPoisFromFamousMeta(meta, catalog)).toEqual([]);
  });
});
