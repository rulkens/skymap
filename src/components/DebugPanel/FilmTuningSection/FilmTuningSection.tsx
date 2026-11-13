/**
 * FilmTuningSection — the DebugPanel's one film-look board: the look's switch
 * and the letterbox, then the grade and the glow as nested groups. Props only;
 * the container owns the store reach.
 */

import { memo } from 'react';
import type { ReactNode } from 'react';
import DebugSection from '../DebugSection';
import DebugTuningSection from '../DebugTuningSection';
import DebugOverlayToggles from '../DebugOverlayToggles';
import styles from './FilmTuningSection.module.css';
import { FILM_GRADE_SLIDER_FIELDS } from '../../../data/film/filmGradeSliderFields';
import { FILM_GLOW_SLIDER_FIELDS } from '../../../data/film/filmGlowSliderFields';
import type { FilmGrade } from '../../../@types/settings/FilmGrade';
import type { FilmGlow } from '../../../@types/settings/FilmGlow';

const TOGGLE_ROWS = [
  { key: 'enabled', label: 'Film look' },
  { key: 'letterbox', label: 'Letterbox 2.39:1' },
] as const;

export type FilmTuningSectionProps = {
  readonly enabled: boolean;
  readonly letterbox: boolean;
  readonly grade: FilmGrade;
  readonly glow: FilmGlow;
  readonly onEnabledChange: (enabled: boolean) => void;
  readonly onLetterboxChange: (letterbox: boolean) => void;
  readonly onGradeChange: (tuning: Partial<FilmGrade>) => void;
  readonly onGlowChange: (tuning: Partial<FilmGlow>) => void;
};

function FilmTuningSection({
  enabled,
  letterbox,
  grade,
  glow,
  onEnabledChange,
  onLetterboxChange,
  onGradeChange,
  onGlowChange,
}: FilmTuningSectionProps): ReactNode {
  return (
    <DebugSection title="Film look">
      <DebugOverlayToggles
        rows={TOGGLE_ROWS}
        overlays={{ enabled, letterbox }}
        onToggle={(key, on) => (key === 'enabled' ? onEnabledChange(on) : onLetterboxChange(on))}
      />
      <div className={styles.group}>
        <DebugTuningSection
          title="Grade"
          fields={FILM_GRADE_SLIDER_FIELDS}
          values={grade}
          onSliderChange={(key, value) => onGradeChange({ [key]: value })}
        />
        <DebugTuningSection
          title="Glow"
          fields={FILM_GLOW_SLIDER_FIELDS}
          values={glow}
          onSliderChange={(key, value) => onGlowChange({ [key]: value })}
        />
      </div>
    </DebugSection>
  );
}

export default memo(FilmTuningSection);
