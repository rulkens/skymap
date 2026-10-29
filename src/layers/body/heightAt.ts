import type { BodyRuntime } from './@types/BodyRuntime';
import type { TerrainHeightAtLookup } from '../../@types/camera/TerrainHeightAtLookup';

/** The ground core's camera reads. Reads `plan` per call, never captured: the planner
 * replaces it every frame. */
export function heightAt({ surfaceTiles }: BodyRuntime): TerrainHeightAtLookup {
  return (bodyId, dir) => surfaceTiles.stream.heightAt(bodyId, dir, surfaceTiles.plan.params);
}
