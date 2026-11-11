import type { FieldFramePlan } from '../../@types/FieldFramePlan';
import type { GalaxyFieldHost } from './GalaxyFieldHost';

/**
 * `milkyWayPlanner`'s value: the live host and the one plan this frame
 * encodes and composites, or null while the field part is off. The compute
 * and the composite read it from `ctx.snapshot.plans`, never the slot.
 */
export type FieldPlannerValue = {
  readonly host: GalaxyFieldHost;
  readonly plan: FieldFramePlan;
} | null;
