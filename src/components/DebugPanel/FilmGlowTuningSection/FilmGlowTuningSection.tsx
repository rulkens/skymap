/** FilmGlowTuningSection — DebugPanel board for the film look's bloom cap, streaks and veil. Props only. */

import { memo } from 'react';
import type { ReactNode } from 'react';
import DebugTuningSection from '../DebugTuningSection';
import { FILM_GLOW_SLIDER_FIELDS } from '../../../data/film/filmGlowSliderFields';
import type { FilmGlow } from '../../../@types/settings/FilmGlow';

export type FilmGlowTuningSectionProps = {
  readonly glow: FilmGlow;
  readonly onGlowChange: (tuning: Partial<FilmGlow>) => void;
};

function FilmGlowTuningSection({ glow, onGlowChange }: FilmGlowTuningSectionProps): ReactNode {
  return (
    <DebugTuningSection
      title="Film glow"
      fields={FILM_GLOW_SLIDER_FIELDS}
      values={glow}
      onSliderChange={(key, value) => onGlowChange({ [key]: value })}
    />
  );
}

export default memo(FilmGlowTuningSection);
