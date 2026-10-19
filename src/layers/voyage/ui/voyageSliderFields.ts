/**
 * voyageSliderFields — the voyage debug section's numeric rows. The launch row is log₁₀ of
 * Earth-years since launch, its ceiling the trip's own arrival, because the trips span 5.9 years
 * to 55 million and a linear row would put all of Proxima inside one pixel of M87's. With no
 * trip there is nothing to launch, so only the headlight row shows.
 */

import type { SliderField } from '../../../@types/data/SliderField';
import type { VoyageSliderKey } from '../@types/VoyageSliderKey';

/** About ten days after launch: the floor of the log row. */
export const EARTH_YR_LOG10_MIN = -1.5;

const HEADLIGHT_FIELD: SliderField<VoyageSliderKey> = {
  key: 'headlight',
  label: 'headlight k',
  min: 0,
  max: 4,
  step: 0.1,
  format: (v) => v.toFixed(1),
  title: 'Headlight exponent on the Doppler factor; 0 is off, 4 is the physical value.',
};

export function voyageSliderFields(
  tEarthTotalYr: number | null,
): readonly SliderField<VoyageSliderKey>[] {
  if (tEarthTotalYr === null) return [HEADLIGHT_FIELD];
  return [
    {
      key: 'earthYrLog10',
      label: 'Earth yr since launch',
      min: EARTH_YR_LOG10_MIN,
      max: Math.log10(tEarthTotalYr),
      step: 0.001,
      format: (v) => (10 ** v).toPrecision(3),
      title: 'Earth (sim) years since launch, log scale; moves the launch instant, not the clock.',
    },
    HEADLIGHT_FIELD,
  ];
}
