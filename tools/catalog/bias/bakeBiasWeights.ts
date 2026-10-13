/**
 * bakeBiasWeights — the per-galaxy weight `--bias-weight` stores in byte 55.
 * Run once per source over the full cross-matched set (after local-volume
 * overrides), never per tier: keyed by record identity, a weight follows its
 * record through `selectTierRecords`, so every tier carries the same weight.
 */
import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { SourceType } from '../../../src/@types/data/SourceType';
import { galaxyCatalogFluxLimit } from '../../../src/data/galaxyCatalog/galaxyCatalogFluxLimits';
import { absoluteFromApparent } from '../../../src/utils/math/absoluteFromApparent';
import { vMaxWeight } from '../../../src/utils/math/vMaxWeight';
import type { BiasWeightKind } from '../../@types/catalog/BiasWeightKind';
import type { ParsedRecord } from '../../parsers/common';
import { computeAngularWeights } from './computeAngularWeights';
import { computeSchechterRatios } from './computeSchechterRatios';

/** 1/V_max reference distance, Mpc: galaxies visible beyond it are dimmed by (D_REF / d_max)³. */
const D_REF_MPC = 750;

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
  records: ParsedRecord[],
  cloud: GalaxyCatalog, // recordsToCloud(records, overrides) — same order as `records`
  source: SourceType,
  kind: BiasWeightKind,
): Map<ParsedRecord, number> {
  let weights: Float32Array;
  if (kind === 'angular') weights = computeAngularWeights({ cloud, source });
  else if (kind === 'schechter') weights = computeSchechterRatios({ cloud, source });
  else if (kind === 'vmax') weights = vMaxWeights(cloud, source);
  else weights = new Float32Array(records.length).fill(1);
  return new Map(records.map((record, i) => [record, weights[i]!]));
}
