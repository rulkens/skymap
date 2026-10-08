import type { LightTimeSpheresRenderer } from './LightTimeSpheresRenderer';

/** The Layer's whole runtime. Non-null: `create` builds it before returning. */
export type LightTimeRuntime = {
  readonly renderer: LightTimeSpheresRenderer;
};
