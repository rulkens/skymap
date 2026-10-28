import type { SkyGridRenderer } from './SkyGridRenderer';

/** The Layer's whole runtime. Non-null: `create` builds it before returning. */
export type SkyGridRuntime = {
  readonly renderer: SkyGridRenderer;
};
