import type { BodyGlintRenderer } from '../../../@types/rendering/BodyGlintRenderer';

/** The Layer's whole runtime. Non-null: `create` builds it before returning. */
export type ProbeSpheresRuntime = {
  /** The Layer's own glint instance, so core's glint batch never carries a sphere. */
  readonly glintRenderer: BodyGlintRenderer;
};
