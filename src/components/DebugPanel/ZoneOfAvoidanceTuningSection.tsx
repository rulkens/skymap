// src/components/DebugPanel/ZoneOfAvoidanceTuningSection.tsx
/**
 * ZoneOfAvoidanceTuningSection — DebugPanel subsection exposing the galactic-
 * plane guide band's look knobs, rows driven from
 * `ZONE_OF_AVOIDANCE_SLIDER_FIELDS` for the three scalar knobs. `color` is a
 * `Vec3`, not a `ZoneOfAvoidanceSliderField`-shaped row, so it gets three
 * bespoke linear-RGB `DebugSlider` rows (0..1 each) instead — the
 * lower-effort alternative to a native colour picker's sRGB<->linear
 * conversion. Dev-only; the explorer-facing SettingsPanel surfaces only the
 * visibility toggles.
 *
 * No copy-to-clipboard diff button (unlike `MilkyWayTuningSection`): the
 * `color` tuple complicates the diff formatter for marginal value at this
 * scope — a deferred nicety, not a gap.
 */

import type { ReactElement } from 'react';
import type { ZoneOfAvoidanceSettings } from '../../@types/settings/ZoneOfAvoidanceSettings';
import type { ZoneOfAvoidanceTuning } from '../../@types/settings/ZoneOfAvoidanceTuning';
import {
  ZONE_OF_AVOIDANCE_SLIDER_FIELDS,
  zoneOfAvoidanceSliderPatch,
} from '../../data/zoneOfAvoidance/zoneOfAvoidanceSliderFields';
import DebugSection from './DebugSection';
import DebugSlider from './DebugSlider';

export type ZoneOfAvoidanceTuningSectionProps = {
  zoneOfAvoidance: ZoneOfAvoidanceSettings;
  onChange: (patch: Partial<ZoneOfAvoidanceTuning>) => void;
};

const COLOR_CHANNELS: readonly { label: string; index: 0 | 1 | 2 }[] = [
  { label: 'colorR', index: 0 },
  { label: 'colorG', index: 1 },
  { label: 'colorB', index: 2 },
];

export function ZoneOfAvoidanceTuningSection({
  zoneOfAvoidance,
  onChange,
}: ZoneOfAvoidanceTuningSectionProps): ReactElement {
  return (
    <DebugSection title="Zone of Avoidance tuning">
      {ZONE_OF_AVOIDANCE_SLIDER_FIELDS.map((f) => (
        <DebugSlider
          key={f.key}
          label={f.label}
          value={zoneOfAvoidance[f.key]}
          min={f.min}
          max={f.max}
          step={f.step}
          readout={f.format(zoneOfAvoidance[f.key])}
          title={f.title}
          onChange={(v) => onChange(zoneOfAvoidanceSliderPatch(f.key, v))}
        />
      ))}
      {COLOR_CHANNELS.map(({ label, index }) => (
        <DebugSlider
          key={label}
          label={label}
          value={zoneOfAvoidance.color[index]}
          min={0}
          max={1}
          step={0.01}
          readout={zoneOfAvoidance.color[index].toFixed(2)}
          title="Veil tint channel, linear RGB."
          onChange={(v) => {
            const color = [...zoneOfAvoidance.color] as ZoneOfAvoidanceTuning['color'];
            color[index] = v;
            onChange({ color });
          }}
        />
      ))}
    </DebugSection>
  );
}
