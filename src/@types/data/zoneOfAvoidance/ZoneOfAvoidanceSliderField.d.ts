import type { SliderField } from '../SliderField';
import type { ZoneOfAvoidanceSliderKey } from './ZoneOfAvoidanceSliderKey';

/**
 * UI metadata for one Zone-of-Avoidance guide-band tuning slider, iterated by
 * the DebugPanel section. No `surface` discriminator (unlike
 * `FlowSliderField`): every one of these knobs is dev-only, so there is
 * exactly one surface.
 */
export type ZoneOfAvoidanceSliderField = SliderField<ZoneOfAvoidanceSliderKey>;
