/**
 * Sgr A* lens pass tuning subsection (see `BlackHoleLensingTuning`'s own
 * docblock). Structural precedent: `src/layers/zoneOfAvoidance/ui/ZoneOfAvoidanceTuningSection.tsx`.
 * `cubemapResolutionPx` gets a `<select>` (four meaningful values) instead of
 * riding the generic slider board — the same "bespoke control after the rows"
 * shape ZoA's colour pickers use.
 *
 * 2048 costs ~192 MiB (2048² × 6 faces × 8 bytes/px rgba16float) — the row's
 * tooltip states the general formula rather than a per-option figure (no
 * precedent in this codebase labels individual `<option>`s with a computed
 * value), fine for a dev-only knob but worth knowing before dragging it up.
 */

import type { ReactElement } from 'react';
import type { BlackHoleLensingTuning } from '../@types/BlackHoleLensingTuning';
import type { HexString } from '../../../@types/math/HexString';
import { hexToLinearRgb } from '../../../utils/color/hexToLinearRgb';
import { linearRgbToHex } from '../../../utils/color/linearRgbToHex';
import {
  BLACK_HOLE_LENSING_SLIDER_FIELDS,
  blackHoleLensingSliderPatch,
} from './blackHoleLensingSliderFields';
import DebugTuningSection from '../../../components/DebugPanel/DebugTuningSection';
import sliderStyles from '../../../components/DebugPanel/DebugSlider.module.css';

export type BlackHoleLensingTuningSectionProps = {
  tuning: BlackHoleLensingTuning;
  onChange: (patch: Partial<BlackHoleLensingTuning>) => void;
};

const CUBEMAP_RESOLUTIONS = [256, 512, 1024, 2048] as const;

export function BlackHoleLensingTuningSection({
  tuning,
  onChange,
}: BlackHoleLensingTuningSectionProps): ReactElement {
  return (
    <DebugTuningSection
      title="Sgr A* lens tuning"
      fields={BLACK_HOLE_LENSING_SLIDER_FIELDS}
      values={tuning}
      onSliderChange={(k, v) => onChange(blackHoleLensingSliderPatch(k, v))}
    >
      <div
        className={sliderStyles.root}
        title="Sky-cubemap capture render-target resolution per face (VRAM: size²×6×8 bytes rgba16float)."
      >
        <span className={sliderStyles.label}>cubemapResolutionPx</span>
        <span className={sliderStyles.readout}>{tuning.cubemapResolutionPx}</span>
        <select
          aria-label="cubemapResolutionPx"
          value={tuning.cubemapResolutionPx}
          onChange={(e) => onChange({ cubemapResolutionPx: Number(e.target.value) })}
        >
          {CUBEMAP_RESOLUTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>
      <div
        className={sliderStyles.root}
        title="Overall tint multiplier on the annulus emission's summed output, linear RGB (picker speaks sRGB). [1,1,1] is a no-op."
      >
        <span className={sliderStyles.label}>emissionTint</span>
        <span className={sliderStyles.readout}>{linearRgbToHex(tuning.emissionTint)}</span>
        <input
          type="color"
          aria-label="emissionTint"
          value={linearRgbToHex(tuning.emissionTint)}
          onChange={(e) => {
            const emissionTint = hexToLinearRgb(e.target.value as HexString);
            onChange({ emissionTint });
          }}
        />
      </div>
    </DebugTuningSection>
  );
}
