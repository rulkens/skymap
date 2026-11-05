import type { LightTimeSpheresRenderer } from '../spheres/@types/LightTimeSpheresRenderer';

/** The Layer's whole runtime. Non-null: `create` builds it before returning. */
export type LightTimeRuntime = {
  readonly renderer: LightTimeSpheresRenderer;
};
