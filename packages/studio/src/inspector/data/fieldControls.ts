/**
 * FIELD_CONTROLS: the widget, unit suffix and stored ↔ shown conversion for every `FieldControl`.
 * Angles are stored in radians and speeds in radians per second, percent as 0–1; the inspector
 * converts at the widget boundary so the draft only ever holds engine units.
 */
import type { FieldControl } from '../../@types/kinds/FieldControl';
import type { FieldWidget } from '../@types/FieldWidget';

const DEG_PER_RAD = 180 / Math.PI;
// toPrecision drops the float noise of the conversion (63° → 1.0995574 rad → 63, not 62.99999999).
const clean = (v: number): number => Number(v.toPrecision(10));
const angle = {
  toDisplay: (rad: number) => clean(rad * DEG_PER_RAD),
  fromDisplay: (deg: number) => deg / DEG_PER_RAD,
};

export const FIELD_CONTROLS: Record<FieldControl, FieldWidget> = {
  seconds: { widget: 'number', unit: 's', step: 0.1, min: 0 },
  mpc: { widget: 'number', unit: 'Mpc', step: 0.1, min: 0 },
  degrees: { widget: 'number', unit: '°', step: 1, ...angle },
  degreesPerSec: { widget: 'number', unit: '°/s', step: 0.1, ...angle },
  percent: {
    widget: 'number',
    unit: '%',
    step: 1,
    min: 0,
    max: 100,
    toDisplay: (fraction) => clean(fraction * 100),
    fromDisplay: (percent) => percent / 100,
  },
  number: { widget: 'number', step: 0.1 },
  ease: { widget: 'pick' },
  toggle: { widget: 'toggle' },
  readout: { widget: 'readout' },
};
