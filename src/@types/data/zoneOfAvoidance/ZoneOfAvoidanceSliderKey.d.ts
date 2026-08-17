import type { ZoneOfAvoidanceTuning } from '../../settings/ZoneOfAvoidanceTuning';

/**
 * Keys of `ZoneOfAvoidanceTuning` that surface as numeric DebugPanel
 * sliders — every scalar knob. `color`/`labelColor` are excluded: both are
 * `Vec3`, not a number, and get their own bespoke controls in the section
 * component.
 */
export type ZoneOfAvoidanceSliderKey = Exclude<keyof ZoneOfAvoidanceTuning, 'color' | 'labelColor'>;
