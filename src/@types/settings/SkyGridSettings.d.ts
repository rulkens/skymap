import type { SkyGridFrame } from './SkyGridFrame';

/**
 * SkyGridSettings — coordinate grids drawn on the sky. `enabled` is the Labels &
 * Guides switch; `frames` picks which coordinate systems draw (no panel control yet).
 */
export type SkyGridSettings = {
  enabled: boolean;
  frames: Record<SkyGridFrame, boolean>;
};
