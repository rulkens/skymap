import type { MissionTrailRenderer } from './MissionTrailRenderer';

/** The Layer's whole runtime. Non-null: `create` builds it before returning. */
export type MissionsRuntime = {
  readonly renderer: MissionTrailRenderer;
};
