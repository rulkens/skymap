import type { EngineSettingsState } from '../../../src/@types/settings/EngineSettingsState';
import type { GpuTimingService } from '../../../src/@types/gpu/timing/GpuTimingService';

/** Options for {@link import('./makeRenderFrameFixture').makeRenderFrameFixture}. */
export type RenderFrameFixtureOptions = {
  /** Defaults to the disabled service, so the frame takes the merged-pass path. */
  readonly timingService?: GpuTimingService;
  /** Whole slices, laid over the fixture's settings root. */
  readonly settings?: Partial<EngineSettingsState>;
};
