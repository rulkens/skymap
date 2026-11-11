/**
 * findMolehillCandidates — the posts of a height grid that could carry a
 * molehill at one spacing: dry land, the highest post within a sixth of the
 * spacing (a crest, not a slope), with relief (window max − min over half the
 * spacing) above a threshold that grows with the spacing, so coarse levels
 * keep only real ranges. The sea counts as 0 m in the min, so a coast is not
 * "relief" down to the sea floor. Importance reads one fixed 80 km window at
 * every level, so hill sizes compare across levels, and gates the candidates:
 * no range in that window, no hill.
 */

import type { HeightGrid } from '../@types/HeightGrid';
import type { MolehillCandidate } from '../@types/MolehillCandidate';
import { heightLatticeStepDeg } from '../../../utils/textures/heightLatticeStepDeg';
import { windowExtremum } from './windowExtremum';

const KM_PER_DEG = 111.195;
const IMPORTANCE_RADIUS_KM = 40;
/** Below this many metres of relief over 80 km a hill draws smallest; 3,000 m draws largest. */
const IMPORTANCE_FLOOR_M = 300;
const IMPORTANCE_SPAN_M = 2700;
/** Elevation's share of the greedy rank: of two equally rugged crests, the higher wins. */
const ELEVATION_WEIGHT = 0.25;
/** No-data and sea read this low in the max windows, so they never win one. */
const VOID_M = -1e4;

/** Fine levels' scaled threshold falls to farmland (274 m at 8 km); a 1690 engraver drew none of it. */
const MIN_RELIEF_M = 800;
/** A hill stands only inside a range: 80 km relief below this is downs, valleys, plateau edge, left bare. */
const MIN_RANGE_RELIEF_M = 1000;

/** Metres of local relief a post needs to count as hilly at this spacing: 1,094 m at 133 km, then the floor. */
const reliefThresholdM = (spacingKm: number) =>
  Math.max(MIN_RELIEF_M, 600 * Math.sqrt(spacingKm / 40));

export function findMolehillCandidates(
  grid: HeightGrid,
  spacingKm: number,
  isCore: (ii: number, jj: number) => boolean,
): MolehillCandidate[] {
  const { nx, ny, h, i0, j0 } = grid;
  const step = heightLatticeStepDeg(grid.z);
  const forMax = h.map((v) => (Number.isNaN(v) ? VOID_M : v));
  const forMin = h.map((v) => (Number.isNaN(v) ? 0 : Math.max(0, v)));
  const high = windowExtremum(forMax, grid, spacingKm / 2, 'max');
  const low = windowExtremum(forMin, grid, spacingKm / 2, 'min');
  const crest = windowExtremum(forMax, grid, Math.max(spacingKm / 6, step * KM_PER_DEG), 'max');
  const threshold = reliefThresholdM(spacingKm);

  const candidates: MolehillCandidate[] = [];
  let importanceHigh: Float32Array | undefined;
  let importanceLow: Float32Array | undefined;
  for (let jj = 0; jj < ny; jj++)
    for (let ii = 0; ii < nx; ii++) {
      const k = jj * nx + ii;
      const elevation = forMax[k]!;
      const relief = high[k]! - low[k]!;
      if (elevation <= 0 || relief < threshold || elevation < crest[k]! - 1e-3 || !isCore(ii, jj))
        continue;
      // Lazily: most bands of the ocean never need the 80 km windows.
      importanceHigh ??= windowExtremum(forMax, grid, IMPORTANCE_RADIUS_KM, 'max');
      importanceLow ??= windowExtremum(forMin, grid, IMPORTANCE_RADIUS_KM, 'min');
      const importanceRelief = importanceHigh[k]! - importanceLow[k]!;
      if (importanceRelief < MIN_RANGE_RELIEF_M) continue;
      candidates.push({
        lonDeg: -180 + (i0 + ii) * step,
        latDeg: 90 - (j0 + jj) * step,
        score: relief + ELEVATION_WEIGHT * elevation,
        importance: Math.min(
          1,
          Math.max(0, (importanceRelief - IMPORTANCE_FLOOR_M) / IMPORTANCE_SPAN_M),
        ),
      });
    }
  return candidates;
}
