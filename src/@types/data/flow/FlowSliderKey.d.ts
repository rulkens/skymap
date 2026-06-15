import type { FlowSettings } from '../../settings/FlowSettings';

/** Keys of `FlowSettings` that surface as numeric sliders (everything but `enabled`/`mode`). */
export type FlowSliderKey = Exclude<keyof FlowSettings, 'enabled' | 'mode'>;
