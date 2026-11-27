import type { SliderDisplayed } from '../../../shared/src/@types/components/SliderDisplayed';
import type { SliderField } from '../../../shared/src/@types/data/SliderField';

/**
 * One workbench slider row, drawn by `SliderRows`: the app's `SliderField`, whose `title` is
 * the row's ⓘ prose. `log` runs the track in log10: `min`, `max` and `step` are log10 units,
 * while the row's value and `format` stay in stored units. `displayed` is for a linear track
 * whose pill shows another quantity (agent count in millions).
 */
export type SliderRowField<K extends string> = SliderField<K> & {
  readonly log?: boolean;
  readonly displayed?: SliderDisplayed;
};
