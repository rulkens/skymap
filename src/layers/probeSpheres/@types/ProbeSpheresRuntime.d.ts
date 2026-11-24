import type { BodyGlintRenderer } from '../../../@types/rendering/BodyGlintRenderer';
import type { MeshBodiesSink } from '../../../@types/engine/layer/MeshBodiesSink';

/** The Layer's whole runtime. Non-null: `create` builds it before returning. */
export type ProbeSpheresRuntime = {
  /** The Layer's own glint instance, so core's glint batch never carries a sphere. */
  readonly glintRenderer: BodyGlintRenderer;
  /** Core's one mesh renderer, which this Layer's mesh slots commit to. */
  readonly meshBodies: MeshBodiesSink;
};
