// src/components/DebugPanel/SgrAStarLensingTuningSection.tsx
/**
 * TEMPORARY (Task 15) — Sgr A* lens pass tuning subsection, deleted at the
 * removal step once Task 17 converges on final values (see
 * `SgrAStarLensingTuning`'s own docblock). Structural precedent:
 * `ZoneOfAvoidanceTuningSection.tsx`. `cubemapResolutionPx` gets a `<select>`
 * (three meaningful values) instead of riding the generic slider board — the
 * same "bespoke control after the rows" shape ZoA's colour pickers use.
 */

import type { ReactElement } from 'react';
import type { SgrAStarLensingTuning } from '../../@types/settings/SgrAStarLensingTuning';
import {
  SGR_A_STAR_LENSING_SLIDER_FIELDS,
  sgrAStarLensingSliderPatch,
} from '../../data/sgrAStarLensing/sgrAStarLensingSliderFields';
import DebugTuningSection from './DebugTuningSection';
import sliderStyles from './DebugSlider.module.css';

export type SgrAStarLensingTuningSectionProps = {
  tuning: SgrAStarLensingTuning;
  onChange: (patch: Partial<SgrAStarLensingTuning>) => void;
};

const CUBEMAP_RESOLUTIONS = [256, 512, 1024] as const;

export function SgrAStarLensingTuningSection({
  tuning,
  onChange,
}: SgrAStarLensingTuningSectionProps): ReactElement {
  return (
    <DebugTuningSection
      title="Sgr A* lens tuning (T15, temp)"
      fields={SGR_A_STAR_LENSING_SLIDER_FIELDS}
      values={tuning}
      onSliderChange={(k, v) => onChange(sgrAStarLensingSliderPatch(k, v))}
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
    </DebugTuningSection>
  );
}
