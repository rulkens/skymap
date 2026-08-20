import type { SliderField } from '../SliderField';
import type { MilkyWaySliderKey } from './MilkyWaySliderKey';

/**
 * UI metadata for one Milky-Way star-cloud tuning slider, iterated by the
 * DebugPanel section. No `surface` discriminator (unlike `FlowSliderField`):
 * every one of these knobs is dev-only, so there is exactly one surface.
 */
export type MilkyWaySliderField = SliderField<MilkyWaySliderKey>;
