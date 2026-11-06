/**
 * atmosphereRosterPlans — a frame's plans store holding `atmosphereRosterPlanner`'s
 * answer as if some view gave each of `rows` a body slab, for a fixture ctx that
 * fakes its snapshot rather than deriving views.
 */

import type { FramePlannerResultStore } from '../../../src/@types/engine/frame/FramePlannerResultStore';
import type { SlabRow } from '../../../src/@types/engine/frame/SlabRow';
import { createFramePlannerResultStore } from '../../../src/services/engine/frame/createFramePlannerResultStore';
import { atmosphereRosterPlanner } from '../../../src/layers/body/atmosphere/present/atmosphereRosterPlanner';
import { BODY_SLAB_ROWS } from '../../../src/layers/body/slabs/present/bodySlabRows';

export function atmosphereRosterPlans(
  rows: readonly SlabRow[] = BODY_SLAB_ROWS,
): FramePlannerResultStore {
  const plans = createFramePlannerResultStore();
  plans.put(atmosphereRosterPlanner, undefined, {
    value: new Set(rows.map((row) => row.anchorId)),
    awake: false,
    settling: false,
    loading: false,
  });
  return plans;
}
