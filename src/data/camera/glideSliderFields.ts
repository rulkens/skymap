/**
 * GLIDE_SLIDER_FIELDS — the one enumeration of the focus glide's tuning knobs
 * as UI rows: label, range, granularity. The DebugPanel's glide section
 * *iterates* this list, so a new knob is one row here plus its `GlideTuning`
 * leaf — the panel picks it up for free and no range is re-spelled in JSX.
 *
 * The ranges are exploration bounds, not safety rails: ρ below ~0.3 is where
 * the arc length goes bimodal (see `glideCalibration`), and the point of the
 * slider is to feel that, so the low end is deliberately reachable.
 */
import type { Ease } from '../../@types/animation/Ease';
import type { GlideTuning } from '../../@types/camera/GlideTuning';
import type { GlideSliderField } from '../../@types/data/camera/GlideSliderField';

export const GLIDE_SLIDER_FIELDS: readonly GlideSliderField[] = [
  { key: 'rho', label: 'ρ pan/zoom', min: 0.01, max: 1.6, step: 0.01 },
  { key: 'velocity', label: 'V arc/s', min: 2, max: 60, step: 1 },
  { key: 'minSec', label: 'min sec', min: 0.1, max: 2, step: 0.05 },
  { key: 'maxSec', label: 'max sec', min: 0.5, max: 6, step: 0.1 },
];

/**
 * GLIDE_EASE_OPTIONS — the curated subset of the 31-member `Ease` union worth
 * tuning a focus arrival with. Every overshoot family (`*Back`, `*Elastic`) is
 * deliberately EXCLUDED: on a geodesic an overshoot walks the arc PAST its
 * endpoint, so the camera flies through the target and back out — nothing
 * throws, it just looks broken.
 */
export const GLIDE_EASE_OPTIONS: readonly Ease[] = [
  'linear',
  'easeOutSine',
  'easeOutQuad',
  'easeOutCubic',
  'easeOutQuart',
  'easeOutQuint',
  'easeOutExpo',
  'easeInOutSine',
  'easeInOutCubic',
  'easeInOutQuart',
];

/**
 * Build a `GlideTuning` patch for one slider. The cast is sound — every field
 * `GLIDE_SLIDER_FIELDS` can name (`GlideSliderField['key']` excludes `ease`,
 * the one non-numeric leaf) is number-valued — but a computed-key literal
 * widens to `{ [k: string]: number }`, which the compiler won't narrow on its
 * own. Localising the cast here keeps the section type-clean (mirrors
 * `flowSliderPatch`).
 */
export function glideSliderPatch(
  key: GlideSliderField['key'],
  value: number,
): Partial<GlideTuning> {
  return { [key]: value } as Partial<GlideTuning>;
}
