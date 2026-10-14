/**
 * bakeBiasWeights — the per-galaxy weight `--bias-weight` stores in byte 55.
 * Run per tier file, over that file's own rows: the angular weight flattens
 * the sample the tier draws, and the tier selection (brightest by absolute
 * magnitude) changes which directions are over-sampled.
 */
import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { SourceType } from '../../../src/@types/data/SourceType';
import { galaxyCatalogFluxLimit } from '../../../src/data/galaxyCatalog/galaxyCatalogFluxLimits';
import { absoluteFromApparent } from '../../../src/utils/math/absoluteFromApparent';
import { vMaxWeight } from '../../../src/utils/math/vMaxWeight';
import type { BiasWeightKind } from '../../@types/catalog/BiasWeightKind';
import { computeAngularWeights } from './computeAngularWeights';
import { computeSchechterRatios } from './computeSchechterRatios';

/** 1/V_max reference distance, Mpc: galaxies visible beyond it are dimmed by (D_REF / d_max)³. */
const D_REF_MPC = 750;

// The byte-55 codec floors at 0.1, so vmax lands in [0.1, 1]: NaN-photometry
// rows (vMaxWeight 0) draw at 0.1×, not hidden.
function vMaxWeights(cloud: GalaxyCatalog, source: SourceType): Float32Array {
  const mLim = galaxyCatalogFluxLimit(source);
  const p = cloud.positions;
  const weights = new Float32Array(cloud.count);
  for (let i = 0; i < cloud.count; i++) {
    const dMpc = Math.hypot(p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!);
    // Raw magG, not the renderer's per-source display offset.
    const absMag = absoluteFromApparent(cloud.magG[i]!, dMpc);
    weights[i] = vMaxWeight({ absMag, mLim, dRefMpc: D_REF_MPC });
  }
  return weights;
}

export function bakeBiasWeights(
  cloud: GalaxyCatalog,
  source: SourceType,
  kind: Exclude<BiasWeightKind, 'none'>,
): Float32Array {
  if (kind === 'angular') return computeAngularWeights({ cloud });
  if (kind === 'schechter') return computeSchechterRatios({ cloud, source });
  return vMaxWeights(cloud, source);
}
