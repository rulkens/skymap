import type { BodyRuntime } from './@types/BodyRuntime';
import type { TerrainQueries } from '../../@types/camera/terrain/TerrainQueries';

/** The ground core's camera reads. Reads `plan` per call, never captured: the planner
 * replaces it every frame. */
export function terrain({ surfaceTiles }: BodyRuntime): TerrainQueries {
  return {
    heightAt: (bodyId, dir) => surfaceTiles.stream.heightAt(bodyId, dir, surfaceTiles.plan.params),
  };
}
