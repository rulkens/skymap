/**
 * syntheticCatalog — an in-tool stand-in for `loadCatalogPoints`, used ONLY
 * behind the `?probe` gate (see `watchCatalogSaga`). Deterministic
 * (one fixed seed, never `Math.random`) so the GPU probe's output is
 * reproducible across runs; clustered rather than uniform so the raymarch
 * has actual structure to draw, not a flat haze.
 */
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { CatalogPoints } from '../../@types/CatalogPoints';
import { Source } from '../../../../src/data/source';
import { gaussian } from '../../../../src/utils/random/gaussian';
import { mulberry32 } from '../../../../src/utils/random/mulberry32';
import { uniformInSphere } from '../../../../src/utils/random/uniformInSphere';

const SEED = 20260818;
const CLUSTER_COUNT = 6;
const POINTS_PER_CLUSTER = 700; // total ~4200 — "a few thousand" per spec §11
const CLUSTER_CENTER_SPREAD_MPC = 80;
const CLUSTER_SIGMA_MPC = 12;
const MEAN_LOG10_MASS = 10; // catalogs' real masses run ~8-12 (see deriveAgentWeights)
const LOG10_MASS_SIGMA = 0.6;
// Exercises the HUD's NaN-fill path (spec §6) without degrading `weightMode:
// 'stellarMass'` to uniform (deriveAgentWeights only degrades on an EMPTY
// finite set) — one in 23 keeps a healthy majority of points massed.
const NAN_MASS_STRIDE = 23;

export function syntheticCatalog(): CatalogPoints {
  const rng = mulberry32(SEED);
  const count = CLUSTER_COUNT * POINTS_PER_CLUSTER;
  const positions = new Float32Array(count * 3);
  const log10StellarMass = new Float32Array(count);

  let i = 0;
  for (let c = 0; c < CLUSTER_COUNT; c++) {
    const center = uniformInSphere(rng).map((v) => v * CLUSTER_CENTER_SPREAD_MPC) as Vec3;
    for (let p = 0; p < POINTS_PER_CLUSTER; p++, i++) {
      positions[3 * i] = center[0] + gaussian(rng) * CLUSTER_SIGMA_MPC;
      positions[3 * i + 1] = center[1] + gaussian(rng) * CLUSTER_SIGMA_MPC;
      positions[3 * i + 2] = center[2] + gaussian(rng) * CLUSTER_SIGMA_MPC;
      log10StellarMass[i] =
        i % NAN_MASS_STRIDE === 0 ? NaN : MEAN_LOG10_MASS + gaussian(rng) * LOG10_MASS_SIGMA;
    }
  }

  return { positions, log10StellarMass, count, sources: [Source.Synthetic] };
}
