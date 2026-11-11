/**
 * placeMolehills — molehills as nested Poisson-disc sets, one per reveal level:
 * level L keeps every hill of the levels before it and adds crests at least
 * `spacingKm(L)` from all of them, greedily by rank across the whole level, so
 * zooming in only ever adds hills between the ones already drawn. Heights are
 * read in latitude bands with a margin of the widest window, so a band's
 * filters see the same posts the whole grid would.
 */

import type { HeightSource } from '../../../textures/@types/HeightSource';
import type { HeightGrid } from '../@types/HeightGrid';
import type { Molehill } from '../@types/Molehill';
import type { MolehillCandidate } from '../@types/MolehillCandidate';
import type { MolehillLevelPlan } from '../@types/MolehillLevelPlan';
import { heightLatticeStepDeg } from '../../../utils/textures/heightLatticeStepDeg';
import { lonLatDegToDirection } from '../../../../src/utils/geo/lonLatDegToDirection';
import { RANGE_WINDOW_KM } from '../data/rangeWindowKm';
import { createSphereHash } from './createSphereHash';
import { findMolehillCandidates } from './findMolehillCandidates';

const KM_PER_DEG = 111.195;
/** Posts per band read: bounds the dozen grid-sized arrays a band's filters hold. */
const BAND_POSTS = 8_000_000;

export async function placeMolehills(
  source: HeightSource,
  plans: readonly MolehillLevelPlan[],
  options: {
    /** Level-0 spacing; level L's is this / 2^L. */
    readonly spacingKm0: number;
    readonly radiusKm: number;
    readonly onLevel?: (level: number, candidates: number, added: number) => void;
  },
): Promise<Molehill[]> {
  const hills: Molehill[] = [];
  for (const { level, z, box } of plans) {
    const spacingKm = options.spacingKm0 / 2 ** level;
    const step = heightLatticeStepDeg(z);
    const postKm = step * KM_PER_DEG;
    const postsRound = Math.round(360 / step);
    const wraps = box.east - box.west >= 360;
    const marginKm = Math.max(spacingKm / 2, RANGE_WINDOW_KM);
    const marginRows = Math.ceil(marginKm / postKm) + 1;
    const rowFirst = Math.ceil((90 - box.north) / step);
    const rowLast = Math.floor((90 - box.south) / step);
    const colWest = Math.ceil((box.west + 180) / step);
    const colEast = Math.floor((box.east + 180) / step);

    const candidates: MolehillCandidate[] = [];
    const bandRows = Math.max(
      16,
      Math.floor(BAND_POSTS / (wraps ? postsRound : colEast - colWest + 1)),
    );
    for (let coreFrom = rowFirst; coreFrom <= rowLast; coreFrom += bandRows) {
      const coreTo = Math.min(rowLast, coreFrom + bandRows - 1);
      const j0 = Math.max(0, coreFrom - marginRows);
      const ny = Math.min(postsRound / 2, coreTo + marginRows) - j0 + 1;
      // A regional box's column margin widens with 1/cos of the band's most poleward row.
      const poleward = Math.max(Math.abs(90 - j0 * step), Math.abs(90 - (j0 + ny - 1) * step));
      const marginCols =
        Math.ceil(marginKm / (postKm * Math.max(0.05, Math.cos((poleward * Math.PI) / 180)))) + 1;
      const i0 = wraps ? 0 : Math.max(0, colWest - marginCols);
      const nx = wraps ? postsRound : Math.min(postsRound - 1, colEast + marginCols) - i0 + 1;
      const h = await source.readGrid(z, i0, j0, nx, ny);
      if (!h) continue;
      const grid: HeightGrid = { z, i0, j0, nx, ny, wraps, h };
      const isCore = (ii: number, jj: number) =>
        j0 + jj >= coreFrom &&
        j0 + jj <= coreTo &&
        (wraps || (i0 + ii >= colWest && i0 + ii <= colEast));
      for (const candidate of findMolehillCandidates(grid, spacingKm, isCore))
        candidates.push(candidate);
    }

    candidates.sort((a, b) => b.score - a.score);
    const hash = createSphereHash(spacingKm / options.radiusKm);
    for (const hill of hills) hash.add(lonLatDegToDirection(hill));
    let added = 0;
    for (const candidate of candidates) {
      const p = lonLatDegToDirection(candidate);
      if (hash.near(p)) continue;
      hash.add(p);
      hills.push({
        lonDeg: candidate.lonDeg,
        latDeg: candidate.latDeg,
        level,
        importance: candidate.importance,
      });
      added++;
    }
    options.onLevel?.(level, candidates.length, added);
  }
  return hills;
}
