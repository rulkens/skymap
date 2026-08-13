// src/components/DebugPanel/ZoneOfAvoidanceTuningSection.tsx
/**
 * Zone of Avoidance tuning subsection; look knobs from `ZONE_OF_AVOIDANCE_SLIDER_FIELDS`.
 * Color pickers (LINEAR RGB values) convert via sRGB↔linear for the widget.
 * Dev-only; SettingsPanel surfaces visibility toggles only.
 */

import type { ReactElement } from 'react';
import type { ZoneOfAvoidanceSettings } from '../../@types/settings/ZoneOfAvoidanceSettings';
import type { ZoneOfAvoidanceTuning } from '../../@types/settings/ZoneOfAvoidanceTuning';
import type { HexString } from '../../@types/math/HexString';
import { hexToLinearRgb } from '../../utils/color/hexToLinearRgb';
import { linearRgbToHex } from '../../utils/color/linearRgbToHex';
import { formatZoneOfAvoidanceTuningDefaults } from '../../utils/format/formatZoneOfAvoidanceTuningDefaults';
import {
  ZONE_OF_AVOIDANCE_SLIDER_FIELDS,
  zoneOfAvoidanceSliderPatch,
} from '../../data/zoneOfAvoidance/zoneOfAvoidanceSliderFields';
import CopyButton from '../common/CopyButton/CopyButton';
import DebugSection from './DebugSection';
import DebugSlider from './DebugSlider';
import sliderStyles from './DebugSlider.module.css';

export type ZoneOfAvoidanceTuningSectionProps = {
  zoneOfAvoidance: ZoneOfAvoidanceSettings;
  onChange: (patch: Partial<ZoneOfAvoidanceTuning>) => void;
};

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
      <div className={sliderStyles.root} title="Veil tint, linear RGB (picker speaks sRGB).">
        <span className={sliderStyles.label}>color</span>
        <span className={sliderStyles.readout}>{linearRgbToHex(zoneOfAvoidance.color)}</span>
        <input
          type="color"
          aria-label="color"
          value={linearRgbToHex(zoneOfAvoidance.color)}
          onChange={(e) => {
            const color = hexToLinearRgb(e.target.value as HexString);
            onChange({ color });
          }}
        />
      </div>
      <div
        className={sliderStyles.root}
        title="Curved-lettering tint, linear RGB (picker speaks sRGB)."
      >
        <span className={sliderStyles.label}>labelColor</span>
        <span className={sliderStyles.readout}>{linearRgbToHex(zoneOfAvoidance.labelColor)}</span>
        <input
          type="color"
          aria-label="labelColor"
          value={linearRgbToHex(zoneOfAvoidance.labelColor)}
          onChange={(e) => {
            const labelColor = hexToLinearRgb(e.target.value as HexString);
            onChange({ labelColor });
          }}
        />
      </div>
      <CopyButton
        text={formatZoneOfAvoidanceTuningDefaults(zoneOfAvoidance)}
        label="Copy current defaults"
        title="Paste into DEFAULT_ZONE_OF_AVOIDANCE_TUNING in data/defaults.ts"
      />
    </DebugSection>
  );
}
