/**
 * SurfaceTileStreamDeps — construction config for `createSurfaceTileStream`.
 */

import type { SurfaceTileBodyId } from '../../data/SurfaceTileBodyId';
import type { SceneBodyId } from '../../scene/SceneBodyId';

export type SurfaceTileStreamDeps = {
  readonly device: GPUDevice;
  /** Wakes the render loop when a fetch lands; the stream never votes itself. */
  readonly requestRender: () => void;
  /** The level the body's COMMITTED whole-globe texture delivers: `heightAt`'s
   *  climb floor, read live, as the planner reads it for the walk's. */
  readonly baseLevelOf: (bodyId: SceneBodyId & SurfaceTileBodyId) => number;
};
