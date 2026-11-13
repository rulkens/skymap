/**
 * FilmGradeTuningSection — DebugPanel board for the film look's grade, with the
 * look's switch and the letterbox beside the sliders. Props only; the container
 * owns the store reach.
 */

import { memo } from 'react';
import type { ReactNode } from 'react';
import DebugTuningSection from '../DebugTuningSection';
import DebugOverlayToggles from '../DebugOverlayToggles';
import { FILM_GRADE_SLIDER_FIELDS } from '../../../data/film/filmGradeSliderFields';
import type { FilmGrade } from '../../../@types/settings/FilmGrade';

const TOGGLE_ROWS = [
  { key: 'enabled', label: 'Film look' },
  { key: 'letterbox', label: 'Letterbox 2.39:1' },
] as const;

export type FilmGradeTuningSectionProps = {
  readonly enabled: boolean;
  readonly letterbox: boolean;
  readonly grade: FilmGrade;
  readonly onEnabledChange: (enabled: boolean) => void;
  readonly onLetterboxChange: (letterbox: boolean) => void;
  readonly onGradeChange: (tuning: Partial<FilmGrade>) => void;
};

function FilmGradeTuningSection({
  enabled,
  letterbox,
  grade,
  onEnabledChange,
  onLetterboxChange,
  onGradeChange,
}: FilmGradeTuningSectionProps): ReactNode {
  return (
    <DebugTuningSection
      title="Film grade"
      fields={FILM_GRADE_SLIDER_FIELDS}
      values={grade}
      onSliderChange={(key, value) => onGradeChange({ [key]: value })}
    >
      <DebugOverlayToggles
        rows={TOGGLE_ROWS}
        overlays={{ enabled, letterbox }}
        onToggle={(key, on) => (key === 'enabled' ? onEnabledChange(on) : onLetterboxChange(on))}
      />
    </DebugTuningSection>
  );
}

export default memo(FilmGradeTuningSection);
