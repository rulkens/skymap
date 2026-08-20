// src/components/DebugPanel/DebugTuningSection.tsx
/**
 * DebugTuningSection — the shared board every `*TuningSection` instantiates:
 * one `DebugSlider` row per field inside a `DebugSection`, then `children`.
 * `children` render AFTER the rows (MW's copy button, ZoA's colour pickers).
 * No `.module.css` — it owns no chrome; every className comes from
 * `DebugSection`/`DebugSlider`. SettingsPanel's flow sliders are
 * deliberately NOT hosted here (D10) — different chrome, different panel.
 */

import type { ReactElement, ReactNode } from 'react';
import type { SliderField } from '../../@types/data/SliderField';
import DebugSection from './DebugSection';
import DebugSlider from './DebugSlider';

export type DebugTuningSectionProps<K extends string> = {
  readonly title: string;
  readonly fields: readonly SliderField<K>[];
  /** The settings cluster; only the row keys are read, all numeric. */
  readonly values: { [P in K]: number };
  readonly onSliderChange: (key: K, value: number) => void;
  /** Per-section extras rendered AFTER the rows (copy button, colour pickers). */
  readonly children?: ReactNode;
};

function DebugTuningSection<K extends string>({
  title,
  fields,
  values,
  onSliderChange,
  children,
}: DebugTuningSectionProps<K>): ReactElement {
  return (
    <DebugSection title={title}>
      {fields.map((f) => (
        <DebugSlider
          key={f.key}
          label={f.label}
          value={values[f.key]}
          min={f.min}
          max={f.max}
          step={f.step}
          readout={f.format(values[f.key])}
          title={f.title}
          onChange={(v) => onSliderChange(f.key, v)}
        />
      ))}
      {children}
    </DebugSection>
  );
}

export default DebugTuningSection;
