/**
 * FocusMovesTuningSection — DebugPanel board for both focus-move styles. The
 * store holds durations in ms; the rows speak seconds, so the ×1000 happens
 * here and nowhere else. Props only; the container owns the store reach.
 */

import { memo } from 'react';
import type { ReactNode } from 'react';
import DebugTuningSection from '../DebugTuningSection';
import { FOCUS_MOVE_SLIDER_FIELDS } from '../../../data/camera/focusMoveSliderFields';
import { GEODESIC_EASES } from '../../../data/camera/focusMoveDefaults';
import type { Ease } from '../../../@types/animation/Ease';
import type { FocusMoveSettings } from '../../../@types/settings/FocusMoveSettings';
import type { GeodesicTuning } from '../../../@types/camera/GeodesicTuning';

export type FocusMovesTuningSectionProps = {
  readonly moves: FocusMoveSettings;
  readonly onEasedDurationChange: (ms: number) => void;
  readonly onGeodesicChange: (tuning: Partial<GeodesicTuning>) => void;
};

function FocusMovesTuningSection({
  moves,
  onEasedDurationChange,
  onGeodesicChange,
}: FocusMovesTuningSectionProps): ReactNode {
  const { eased, geodesic } = moves;
  const values = {
    easedS: eased.durationMs / 1000,
    rho: geodesic.rho,
    velocity: geodesic.velocity,
    minS: geodesic.minMs / 1000,
    maxS: geodesic.maxMs / 1000,
  };

  function onSliderChange(key: keyof typeof values, value: number): void {
    switch (key) {
      case 'easedS':
        return onEasedDurationChange(value * 1000);
      case 'minS':
        return onGeodesicChange({ minMs: value * 1000 });
      case 'maxS':
        return onGeodesicChange({ maxMs: value * 1000 });
      default:
        return onGeodesicChange({ [key]: value });
    }
  }

  return (
    <DebugTuningSection
      title="Focus moves"
      fields={FOCUS_MOVE_SLIDER_FIELDS}
      values={values}
      onSliderChange={onSliderChange}
    >
      <label title="Ease of the Geodesic arrival. Monotone eases only; an overshoot would fly past the target.">
        Geodesic ease{' '}
        <select
          value={geodesic.ease}
          onChange={(e) => onGeodesicChange({ ease: e.target.value as Ease })}
        >
          {GEODESIC_EASES.map((ease) => (
            <option key={ease} value={ease}>
              {ease}
            </option>
          ))}
        </select>
      </label>
    </DebugTuningSection>
  );
}

export default memo(FocusMovesTuningSection);
