import type { AgentWeights } from '../../@types/AgentWeights';
import type { CatalogPoints } from '../../@types/CatalogPoints';
import type { GridBox } from '../../@types/GridBox';
import type { McpmParams } from '../../@types/McpmParams';
import type { Tier } from '../../../../src/@types/data/Tier';
import { galaxyCatalogIdOf } from '../../../../src/utils/galaxyCatalogIdOf';
import { boxHalfExtentMpc } from '../field/boxHalfExtentMpc';
import { buildParamsPayload } from '../state/exportParams';

// Local time with a numeric (no-colon) UTC offset — "+0200", matching the
// spec §8 example. parsePolyphyTraceSidecar stores provenance untyped, so
// this exact format is this exporter's convention, not a parsed contract.
function formatProducedAt(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const offsetH = pad(Math.floor(Math.abs(offsetMin) / 60));
  const offsetM = pad(Math.abs(offsetMin) % 60);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${offsetH}${offsetM}`
  );
}

/**
 * emitTraceSidecar — the `polyphy-trace` v1 JSON `parsePolyphyTraceSidecar`/
 * `buildRhizomeVolume` expect next to the `.npy`, same basename (spec §8).
 * `voxel_size_mpc` repeats `box.voxelSizeMpc` three times: GridBox's voxels
 * are cubic by construction (autoFitGridBox), so the importer's 0.5% spread
 * assert passes with zero margin consumed, not just under the line.
 * `voxel_order` is always `'c-order'`: this sidecar only ever accompanies
 * `exportNpy.ts`'s output, which unconditionally runs `xFastestToCOrder`.
 */
export function emitTraceSidecar(input: {
  readonly box: GridBox;
  readonly points: CatalogPoints;
  readonly weights: AgentWeights;
  readonly tier: Tier;
  readonly params: McpmParams;
  readonly agentCount: number;
  readonly steps: number;
  readonly seed: number;
  readonly producedAt: Date;
}): string {
  const { box, points, weights, tier, params, agentCount, steps, seed, producedAt } = input;
  const half = boxHalfExtentMpc(box.sizeMpc);
  const originMpc = [
    box.centerMpc[0] - half[0],
    box.centerMpc[1] - half[1],
    box.centerMpc[2] - half[2],
  ];

  const sidecar = {
    format: 'polyphy-trace',
    version: 1,
    dims: box.dims,
    origin_mpc: originMpc,
    voxel_size_mpc: [box.voxelSizeMpc, box.voxelSizeMpc, box.voxelSizeMpc],
    // Honest metadata, not an instruction the importer acts on (spec §8's non-goal) —
    // buildRhizomeVolume/the comparator keep treating the cube as the flat grid-space
    // array it is; a downstream consumer that cares reads this and applies it itself,
    // pivoting about the box CENTER, not origin_mpc (worldToBoxLocal.ts: it subtracts
    // centerMpc, rotates, THEN adds half-extent — origin_mpc is the un-rotated corner).
    rotation: box.rotation,
    voxel_order: 'c-order',
    frame: 'equatorial-cartesian',
    value_units: 'mcpm-trace-density',
    provenance: {
      producer: 'mcpm-workbench',
      produced_at: formatProducedAt(producedAt),
      catalog: {
        sources: points.sources.map(galaxyCatalogIdOf),
        tier,
        n_points: points.count,
        nan_mass_filled: weights.nanCount,
      },
      // V3's exportParams preset carries the SAME object, via the same
      // buildParamsPayload — spec §10's "keep the two shapes identical".
      params: buildParamsPayload(params),
      n_agents: agentCount,
      steps,
      seed,
    },
  };

  return JSON.stringify(sidecar, null, 2);
}
