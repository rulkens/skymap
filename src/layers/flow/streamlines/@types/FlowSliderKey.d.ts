import type { FlowSettings } from '../../@types/FlowSettings';

/** Keys of `FlowSettings` that surface as numeric sliders (everything but `enabled`/`mode`). */
export type FlowSliderKey = Exclude<keyof FlowSettings, 'enabled' | 'mode'>;
