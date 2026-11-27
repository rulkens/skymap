import type { BodyRuntime } from './@types/BodyRuntime';
import type { TerrainQueries } from '../../@types/camera/terrain/TerrainQueries';

/** The ground core reads. Reads `plan` per call, never captured: the planner replaces it every
 * frame. The no-shadows overlay lights mesh bodies as it lights the tiles under them. */
export function terrain({ surfaceTiles, noTerrainShadows }: BodyRuntime): TerrainQueries {
  return {
    heightAt: (bodyId, dir) => surfaceTiles.stream.heightAt(bodyId, dir, surfaceTiles.plan.params),
    horizonAt: (bodyId, dir) =>
      noTerrainShadows()
        ? null
        : surfaceTiles.stream.horizonAt(bodyId, dir, surfaceTiles.plan.params),
  };
}
