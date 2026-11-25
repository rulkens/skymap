import type { SliderDisplayed } from '../../../../../../src/@types/components/SliderDisplayed';

/** A `log: true` slider stores log10 and shows 10^v, so its typed box takes 10^v too. */
export const LOG10_DISPLAYED: SliderDisplayed = {
  fromValue: (v) => 10 ** v,
  toValue: (shown) => Math.log10(shown),
};
