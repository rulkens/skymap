/**
 * FilmTuningSection — the DebugPanel's one film-look board: the look's switch
 * and the letterbox with its ratio, then the grade and the glow as nested groups. Props only;
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
import { LETTERBOX_ASPECTS } from '../../../data/film/letterboxAspects';
import type { FilmGrade } from '../../../@types/settings/FilmGrade';
import type { FilmGlow } from '../../../@types/settings/FilmGlow';

const TOGGLE_ROWS = [
  { key: 'enabled', label: 'Film look' },
  { key: 'letterbox', label: 'Letterbox' },
] as const;

export type FilmTuningSectionProps = {
  readonly enabled: boolean;
  readonly letterbox: boolean;
  readonly letterboxAspect: number;
  readonly grade: FilmGrade;
  readonly glow: FilmGlow;
  readonly onEnabledChange: (enabled: boolean) => void;
  readonly onLetterboxChange: (letterbox: boolean) => void;
  readonly onLetterboxAspectChange: (aspect: number) => void;
  readonly onGradeChange: (tuning: Partial<FilmGrade>) => void;
  readonly onGlowChange: (tuning: Partial<FilmGlow>) => void;
};

function FilmTuningSection({
  enabled,
  letterbox,
  letterboxAspect,
  grade,
  glow,
  onEnabledChange,
  onLetterboxChange,
  onLetterboxAspectChange,
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
      <label>
        Ratio{' '}
        <select
          value={String(letterboxAspect)}
          onChange={(e) => onLetterboxAspectChange(Number(e.target.value))}
        >
          {LETTERBOX_ASPECTS.map(({ value, label }) => (
            <option key={label} value={String(value)}>
              {label}
            </option>
          ))}
        </select>
      </label>
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
