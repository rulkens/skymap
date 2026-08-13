// src/components/DebugPanel/ZoneOfAvoidanceTuningSection.tsx
/**
 * ZoneOfAvoidanceTuningSection — DebugPanel subsection exposing the galactic-
 * plane guide band's look knobs, rows driven from
 * `ZONE_OF_AVOIDANCE_SLIDER_FIELDS` for the three scalar knobs. `color` and
 * `labelColor` are each a `Vec3`, not a `ZoneOfAvoidanceSliderField`-shaped
 * row, so they each get a native `<input type="color">` row instead: the
 * tuning value stays LINEAR RGB (the shader multiplies it straight into an
 * HDR additive target), and `hexToLinearRgb`/`linearRgbToHex` do the
 * sRGB<->linear conversion the widget's hex value requires. Dev-only; the
 * explorer-facing SettingsPanel surfaces only the visibility toggles.
 *
 * No copy-to-clipboard diff button (unlike `MilkyWayTuningSection`): the
 * `color` tuple complicates the diff formatter for marginal value at this
 * scope — a deferred nicety, not a gap.
 */

import type { ReactElement } from 'react';
import type { ZoneOfAvoidanceSettings } from '../../@types/settings/ZoneOfAvoidanceSettings';
import type { ZoneOfAvoidanceTuning } from '../../@types/settings/ZoneOfAvoidanceTuning';
import type { HexString } from '../../@types/math/HexString';
import { hexToLinearRgb } from '../../utils/color/hexToLinearRgb';
import { linearRgbToHex } from '../../utils/color/linearRgbToHex';
import {
  ZONE_OF_AVOIDANCE_SLIDER_FIELDS,
  zoneOfAvoidanceSliderPatch,
} from '../../data/zoneOfAvoidance/zoneOfAvoidanceSliderFields';
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
    </DebugSection>
  );
}
