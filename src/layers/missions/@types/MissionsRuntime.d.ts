import type { MissionTrailRenderer } from '../trails/@types/MissionTrailRenderer';
import type { BodyGlintRenderer } from '../../../@types/rendering/BodyGlintRenderer';
import type { CatalogPickCodes } from '../../../@types/engine/selection/CatalogPickCodes';
import type { SourceType } from '../../../@types/data/SourceType';

/** The Layer's whole runtime. Non-null: `create` builds it before returning. */
export type MissionsRuntime = {
  readonly trailRenderer: MissionTrailRenderer;
  /** The craft's own glint instance, so core's glint batch never carries them. */
  readonly glintRenderer: BodyGlintRenderer;
  /** Row ↔ pick code; the craft's mesh, caption and selection row all stamp through it. */
  readonly pickCodes: CatalogPickCodes<SourceType>;
};
