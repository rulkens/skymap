// src/components/DebugPanel/GlideTuningSection.tsx
/**
 * GlideTuningSection — DebugPanel subsection for the focus/home camera glide's
 * calibration (ρ, V, the duration clamp, and the arrival ease). These numbers
 * used to be edited in `glideCalibration.ts` and rebuilt, which is a poor loop
 * for a feel knob; here they are live, and the NEXT focus move picks them up.
 *
 * ρ is the one that changes the path itself — low ρ makes the camera travel
 * laterally, high ρ bows it out and up. The sliders only stretch the clock;
 * `ease` reparametrises the already-timed arc, shaping the arrival.
 *
 * Rows are driven from `GLIDE_SLIDER_FIELDS`, so ranges live in that registry
 * rather than being re-spelled here. The ease `<select>` is a fifth row off
 * `GLIDE_EASE_OPTIONS` — a curated subset, not the full 31-member `Ease` union.
 */

import type { ReactNode } from 'react';
import type { Ease } from '../../@types/animation/Ease';
import type { GlideTuning } from '../../@types/camera/GlideTuning';
import {
  GLIDE_EASE_OPTIONS,
  GLIDE_SLIDER_FIELDS,
  glideSliderPatch,
} from '../../data/camera/glideSliderFields';
import Slider from '../common/Slider/Slider';
import DebugSection from './DebugSection';
import styles from './GlideTuningSection.module.css';

export type GlideTuningSectionProps = {
  readonly glide: GlideTuning;
  readonly onChange: (patch: Partial<GlideTuning>) => void;
};

function GlideTuningSection({ glide, onChange }: GlideTuningSectionProps): ReactNode {
  return (
    <DebugSection title="Glide tuning">
      <div className={styles.root}>
        {GLIDE_SLIDER_FIELDS.map((field) => (
          <Slider
            key={field.key}
            label={field.label}
            value={glide[field.key]}
            min={field.min}
            max={field.max}
            step={field.step}
            onChange={(value) => onChange(glideSliderPatch(field.key, value))}
          />
        ))}
        <label className={styles.easeRow}>
          <span>ease</span>
          <select
            className={styles.easeSelect}
            value={glide.ease}
            onChange={(e) => onChange({ ease: e.target.value as Ease })}
          >
            {GLIDE_EASE_OPTIONS.map((ease) => (
              <option key={ease} value={ease}>
                {ease}
              </option>
            ))}
          </select>
        </label>
      </div>
    </DebugSection>
  );
}

export default GlideTuningSection;
