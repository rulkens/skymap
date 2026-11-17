import type { MissionTrailRenderer } from '../trails/@types/MissionTrailRenderer';
import type { BodyGlintRenderer } from '../../../@types/rendering/BodyGlintRenderer';

/** The Layer's whole runtime. Non-null: `create` builds it before returning. */
export type MissionsRuntime = {
  readonly trailRenderer: MissionTrailRenderer;
  /** The craft's own glint instance, so core's glint batch never carries them. */
  readonly glintRenderer: BodyGlintRenderer;
  /** The craft's pick code; the mesh, caption and selection row all stamp it. */
  readonly pickCode: number;
};
