import type { LightTimeSpheresRenderer } from '../../../@types/rendering/LightTimeSpheresRenderer';

/** The Layer's whole runtime. Non-null: `create` builds it before returning. */
export type LightTimeRuntime = {
  readonly renderer: LightTimeSpheresRenderer;
};
