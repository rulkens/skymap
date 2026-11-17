/**
 * AntiqueTuningSection — DebugPanel board for the engraved-atlas look's live knobs:
 * sliders, the paper tint, the sky's ruling frame and a switch per plate row, so one
 * row can be judged alone. Reset returns every knob to the shipped defaults; Copy
 * hands only the moved ones back as `ANTIQUE_TUNING_DEFAULTS` lines.
 */

import { memo } from 'react';
import type { ReactNode } from 'react';
import type { AntiqueTuning } from '../../../@types/settings/AntiqueTuning';
import type { HexString } from '../../../@types/math/HexString';
import { ANTIQUE_PLATE_ROWS, ANTIQUE_TUNING_DEFAULTS } from '../../../data/rendering/antiqueTuning';
import {
  ANTIQUE_SKY_RULINGS_OPTIONS,
  ANTIQUE_TUNING_SLIDER_FIELDS,
} from '../../../data/rendering/antiqueTuningSliderFields';
import { formatAntiqueTuning } from '../../../utils/gpu/antiqueLook/formatAntiqueTuning';
import CopyButton from '../../common/CopyButton/CopyButton';
import DebugTuningSection from '../DebugTuningSection';
import DebugOverlayToggles from '../DebugOverlayToggles';
import sliderStyles from '../DebugSlider.module.css';
import sectionStyles from '../debugSection.module.css';

export type AntiqueTuningSectionProps = {
  /** The look is on: with it off the knobs move nothing, and the title says so. */
  readonly enabled: boolean;
  readonly tuning: AntiqueTuning;
  readonly onChange: (patch: Partial<AntiqueTuning>) => void;
  readonly onReset: () => void;
};

function AntiqueTuningSection({
  enabled,
  tuning,
  onChange,
  onReset,
}: AntiqueTuningSectionProps): ReactNode {
  const moved = formatAntiqueTuning(tuning, ANTIQUE_TUNING_DEFAULTS);
  return (
    <DebugTuningSection
      title={enabled ? 'Antique look' : 'Antique look (off)'}
      fields={ANTIQUE_TUNING_SLIDER_FIELDS}
      values={tuning}
      onSliderChange={(key, value) => onChange({ [key]: value })}
    >
      <label className={sliderStyles.root} title="Multiplies the sheet; white leaves it as printed">
        <span className={sliderStyles.label}>Paper tint</span>
        <span className={sliderStyles.readout}>{tuning.paperTint}</span>
        <input
          type="color"
          value={tuning.paperTint}
          onChange={(e) => onChange({ paperTint: e.target.value as HexString })}
        />
      </label>
      <label className={sliderStyles.root}>
        <span className={sliderStyles.label}>Sky rulings</span>
        <select
          value={tuning.skyRulings}
          onChange={(e) => onChange({ skyRulings: e.target.value as AntiqueTuning['skyRulings'] })}
        >
          {ANTIQUE_SKY_RULINGS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <span className={sectionStyles.readout}>Rows printed</span>
      <DebugOverlayToggles
        rows={ANTIQUE_PLATE_ROWS}
        overlays={tuning.rows}
        onToggle={(key, on) => onChange({ rows: { ...tuning.rows, [key]: on } })}
      />
      <div className={sectionStyles.buttonRow}>
        <button
          type="button"
          className={sectionStyles.button}
          disabled={moved.length === 0}
          onClick={onReset}
        >
          Reset to defaults
        </button>
        <CopyButton
          text={moved}
          label="Copy changed values"
          title="Paste into ANTIQUE_TUNING_DEFAULTS in data/rendering/antiqueTuning.ts"
        />
      </div>
    </DebugTuningSection>
  );
}

export default memo(AntiqueTuningSection);
