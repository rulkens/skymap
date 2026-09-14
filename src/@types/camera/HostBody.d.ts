import type { BodyId } from '../data/body/BodyId';
import type { BodyState } from '../scene/BodyState';

/** The body a rung is currently anchored to, resolved for this frame. */
export type HostBody = {
  readonly id: BodyId;
  readonly state: BodyState;
  /** Ground radius, metres — SCENE_CELESTIAL_BODIES, never a bounding hull. */
  readonly radiusM: number;
};
