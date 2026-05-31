import { describe, expect, it } from 'vitest';
import { buildPoisFromFamousMeta } from '../../../../src/services/engine/phases/buildPoisFromFamousMeta';
import type { FamousMetaEntry } from '../../../../src/@types/loading/FamousMetaEntry';
import type { GalaxyCatalog } from '../../../../src/@types/data/GalaxyCatalog';
import type { PointOfInterest } from '../../../../src/@types/engine/subsystems/PointOfInterest';

/**
 * Narrow a produced POI to the famousGalaxy arm so the label/size fields
 * are in scope.  `buildPoisFromFamousMeta` only ever emits famousGalaxy
 * POIs; a throw here means the producer regressed its discriminant.
 */
function famous(p: PointOfInterest): Extract<PointOfInterest, { category: 'famousGalaxy' }> {
  if (p.category !== 'famousGalaxy') throw new Error(`expected famousGalaxy, got ${p.category}`);
  return p;
}

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
    classByte: new Uint8Array(count),
    parentSurveyByte: new Uint8Array(count),
    spectroscopicZ: new Float32Array(count),
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
    // Uses commonName when set — shared `famousDisplayName` helper.
    expect(pois[0]!.name).toBe('Andromeda Galaxy');
    expect(pois[0]!.category).toBe('famousGalaxy');
    expect(pois[0]!.worldPos).toEqual([
      catalog.positions[0],
      catalog.positions[1],
      catalog.positions[2],
    ]);
    expect(famous(pois[0]!).minApparentSizePx).toBe(6);
    expect(famous(pois[0]!).apparentDiameterKpc).toBe(67);
    // Famous galaxies are the arm without a radius — the field is absent.
    expect('physicalRadiusMpc' in pois[0]!).toBe(false);
    // labelAnchorOffsetMpc = max(0.05, 1.5 * 67 / 1000) = max(0.05, 0.1005) = 0.1005
    expect(famous(pois[0]!).labelAnchorOffsetMpc).toBeCloseTo(0.1005, 6);
    // labelWorldEmMpc = 0.0125 * 10^(0.3 * log10(67 / 40))
    //                 = 0.0125 * 10^(0.3 * log10(1.675))
    //                 ≈ 0.0125 * 1.1674 ≈ 0.014593
    // Use 4 decimal-place precision (±5e-5) to avoid floating-point drift.
    expect(famous(pois[0]!).labelWorldEmMpc).toBeCloseTo(0.014593, 4);
    expect(pois[1]!.id).toBe('famous-m33');
    expect(pois[1]!.name).toBe('M33'); // no commonName → falls back to names[0]
    // M33 diameter 30 kpc → 1.5 * 30/1000 = 0.045, below floor 0.05 → uses floor.
    expect(famous(pois[1]!).labelAnchorOffsetMpc).toBeCloseTo(0.05, 6);
    // labelWorldEmMpc = 0.0125 * 10^(0.3 * log10(30 / 40))
    //                 = 0.0125 * 10^(0.3 * log10(0.75))
    //                 ≈ 0.0125 * 0.9175 ≈ 0.011469
    expect(famous(pois[1]!).labelWorldEmMpc).toBeCloseTo(0.011469, 4);
  });

  it('labelWorldEmMpc scales monotonically with diameter (1 kpc < 100 kpc < 5000 kpc)', () => {
    // No per-POI clamp: the formula is a pure power-law, so larger diameter → larger worldEmMpc.
    // Pixel clamps are applied at the category level (POI_STYLES.famousGalaxy), not here.
    const meta: FamousMetaEntry[] = [
      { id: 'tiny', names: ['Tiny'], description: '', type: '' },
      { id: 'mid', names: ['Mid'], description: '', type: '' },
      { id: 'huge', names: ['Huge'], description: '', type: '' },
    ];
    const catalog = makeCatalog([1, 0, 0, 2, 0, 0, 3, 0, 0], [1, 100, 5000]);
    const pois = buildPoisFromFamousMeta(meta, catalog);
    const em1 = famous(pois[0]!).labelWorldEmMpc!;
    const em100 = famous(pois[1]!).labelWorldEmMpc!;
    const em5000 = famous(pois[2]!).labelWorldEmMpc!;
    expect(em1).toBeGreaterThan(0);
    expect(em100).toBeGreaterThan(em1);
    expect(em5000).toBeGreaterThan(em100);
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

  it('uses commonName when set, then names[0], then id (shared famousDisplayName ladder)', () => {
    const meta: FamousMetaEntry[] = [
      { id: 'a', names: ['A1', 'A2'], commonName: 'Curated A', description: '', type: '' },
      { id: 'b', names: ['B1', 'B2'], description: '', type: '' },
      { id: 'c', names: ['C1'], description: '', type: '' },
      { id: 'd', names: [], description: '', type: '' },
    ];
    const catalog = makeCatalog([1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0, 0], [10, 10, 10, 10]);
    const pois = buildPoisFromFamousMeta(meta, catalog);
    expect(pois.map((p) => p.name)).toEqual(['Curated A', 'B1', 'C1', 'd']);
  });

  it('marks famous POIs as featured with no significance field (galaxy arm)', () => {
    const meta: FamousMetaEntry[] = [{ id: 'm31', names: ['M31'], description: '', type: '' }];
    const catalog = makeCatalog([0.78, 0.1, 0.2], [67]);
    const pois = buildPoisFromFamousMeta(meta, catalog);
    expect(pois[0]!.featured).toBe(true);
    // significance lives on the structure arms only — the famous arm
    // never carries it, so the field is absent rather than undefined.
    expect('significance' in pois[0]!).toBe(false);
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
