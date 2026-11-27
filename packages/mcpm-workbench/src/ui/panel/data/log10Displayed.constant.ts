import type { SliderDisplayed } from '../../../../../shared/src/@types/components/SliderDisplayed';

// 10 ** log10(x) leaves float dust (3.125 → 3.1250000000000004) in the typed box's prefill.
const SHOWN_SIGNIFICANT_DIGITS = 12;

/** A `log: true` slider stores log10 and shows 10^v, so its typed box takes 10^v too. */
export const LOG10_DISPLAYED: SliderDisplayed = {
  fromValue: (v) => Number((10 ** v).toPrecision(SHOWN_SIGNIFICANT_DIGITS)),
  toValue: (shown) => Math.log10(shown),
};
