import type { FieldTarget } from '../@types/FieldTarget';
import type { FieldTargetId } from '../@types/FieldTargetId';
import type { GalaxyFieldRenderTargets } from '../@types/GalaxyFieldRenderTargets';

/**
 * A planned target, by id. The plan lists only the targets its host was built
 * with (`GalaxyFieldHostDeps.targetIds`), so a miss is a wiring bug and throws
 * rather than silently skipping a pass and its timing tick.
 */
export function fieldTargetOf(targets: GalaxyFieldRenderTargets, id: FieldTargetId): FieldTarget {
  const target = targets[id];
  if (!target) throw new Error(`field target '${id}' is planned but not allocated`);
  return target;
}
