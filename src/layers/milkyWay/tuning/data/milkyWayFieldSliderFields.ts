/**
 * MILKY_WAY_FIELD_SLIDER_FIELDS — the v2 field's slider rows: exposure, then one
 * divisor row per app field target. A parity test keeps the keys equal to
 * `['exposure', ...APP_FIELD_TARGET_IDS]`; `milkyWayFieldSliderPatch` writes them.
 */
import type { SliderField } from '../../../../@types/data/SliderField';
import { APP_FIELD_TARGET_IDS } from '../../field/data/appFieldTargetIds';
import type { MilkyWayFieldSliderKey } from '../@types/MilkyWayFieldSliderKey';

export const MILKY_WAY_FIELD_SLIDER_FIELDS: readonly SliderField<MilkyWayFieldSliderKey>[] = [
  {
    key: 'exposure',
    label: 'fieldExposure',
    min: 0,
    max: 4,
    step: 0.01,
    format: (v) => v.toFixed(2),
    title: 'Multiplier on the field light. 1 is the calibration point.',
  },
  ...APP_FIELD_TARGET_IDS.map(
    (id): SliderField<MilkyWayFieldSliderKey> => ({
      key: id,
      label: `${id} div`,
      min: 1,
      max: 8,
      step: 1,
      format: (v) => String(Math.round(v)),
      title: `Downsample divisor of the ${id} target against the canvas. Fragment cost falls as its square.`,
    }),
  ),
];
