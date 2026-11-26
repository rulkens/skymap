import type { BodyGlintRenderer } from '../../../@types/rendering/BodyGlintRenderer';
import type { MeshBodiesSink } from '../../../@types/engine/layer/MeshBodiesSink';

/** The Layer's whole runtime. Non-null: `create` builds it before returning. */
export type MissionsRuntime = {
  /** The craft's own glint instance, so core's glint batch never carries them. */
  readonly glintRenderer: BodyGlintRenderer;
  /** The craft's pick code; the mesh, caption and selection row all stamp it. */
  readonly pickCode: number;
  /** Core's one mesh renderer, which this Layer's mesh slots commit to. */
  readonly meshBodies: MeshBodiesSink;
};
