/**
 * floorsOf — attribute per-layer costs to their render-step groups and estimate
 * each group's shared per-pass floor.
 *
 * For each group the `slotGroups` map buckets the perLayerTimed stats into, and
 * that ALSO appears as a merged group slot (`slot === groupKey`), estimate the
 * fixed per-pass overhead from `(Σ Lᵢ − G)/n` (see `estimateFloor`) and each
 * layer's floor-subtracted real cost. Groups with a single layer are skipped —
 * no merged-vs-split gap to separate — matching `estimateFloor`'s own n<2 guard,
 * so `floors` only ever carries attributable multi-layer groups.
 *
 * ### Why the self-mapping guard
 *
 * `slotGroups` maps a group KEY to itself (`'hdr·NEAR0' → 'hdr·NEAR0'`) so a
 * merged-run group slot resolves through the same table as its per-layer
 * children. GPU timestamp readback lags the render by 1–2 frames, so even with
 * the collectTimings warmup a merged-run group AGGREGATE can still leak into a
 * perLayerTimed sample. An aggregate is not a layer: bucketing it would count it
 * as an extra member inside its own group, inflating Σ Lᵢ and the floor. So a
 * perLayer stat that maps to ITSELF (`slotGroups[slot] === slot`) is dropped
 * here — a real layer always maps to a DIFFERENT group key.
 */

import { estimateFloor } from './estimateFloor';
import type { ScenarioReport, LayerStat } from '../../perf/scenarioReport';

export function floorsOf(
  merged: readonly LayerStat[],
  perLayer: readonly LayerStat[],
  slotGroups: Readonly<Record<string, string>>,
): ScenarioReport['floors'] {
  const mergedMedianByGroup = new Map<string, number>();
  for (const stat of merged) mergedMedianByGroup.set(stat.slot, stat.median);

  const buckets = new Map<string, LayerStat[]>();
  for (const stat of perLayer) {
    // Drop a leaked group aggregate: it maps to itself, a real layer never does.
    if (slotGroups[stat.slot] === stat.slot) continue;
    const groupKey = slotGroups[stat.slot] ?? stat.slot;
    const bucket = buckets.get(groupKey);
    if (bucket) bucket.push(stat);
    else buckets.set(groupKey, [stat]);
  }

  const floors: ScenarioReport['floors'][number][] = [];
  for (const [groupKey, layerStats] of buckets) {
    const mergedMedian = mergedMedianByGroup.get(groupKey);
    if (mergedMedian === undefined || layerStats.length < 2) continue;
    const floor = estimateFloor(
      layerStats.map((stat) => stat.median),
      mergedMedian,
    );
    floors.push({
      groupKey,
      floor,
      reals: layerStats.map((stat) => ({ slot: stat.slot, real: stat.median - floor })),
    });
  }
  return floors;
}
