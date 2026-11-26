/**
 * SliderRows — one `SliderRow` per field, the workbench's counterpart of the app's
 * `DebugTuningSection`. A `log` field travels in log10 here and nowhere else: the
 * values in and out are stored units.
 */
import type { ReactNode } from 'react';
import type { SliderRowField } from '../../../../@types/ui/SliderRowField';
import { LOG10_DISPLAYED } from '../data/log10Displayed.constant';
import SliderRow from '../SliderRow/SliderRow';

export type SliderRowsProps<K extends string> = {
  readonly fields: readonly SliderRowField<K>[];
  /** Only the field keys are read. */
  readonly values: { readonly [P in K]: number };
  /** The store object the keys sit in (`view.pathTracer`); each tip shows `<path>.<key>`. */
  readonly path: string;
  readonly onChange: (key: K, value: number) => void;
};

function SliderRows<K extends string>({
  fields,
  values,
  path,
  onChange,
}: SliderRowsProps<K>): ReactNode {
  return fields.map((field) => (
    <SliderRow
      key={field.key}
      label={field.label}
      value={field.log ? Math.log10(values[field.key]) : values[field.key]}
      min={field.min}
      max={field.max}
      step={field.step}
      format={field.log ? (v) => field.format(10 ** v) : field.format}
      displayed={field.log ? LOG10_DISPLAYED : field.displayed}
      info={field.title}
      onChange={(v) => onChange(field.key, field.log ? 10 ** v : v)}
      path={`${path}.${field.key}`}
    />
  ));
}

export default SliderRows;
