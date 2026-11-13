/** FilmTuningSectionContainer — store boundary for the DebugPanel film-look board. */

import { memo, useCallback } from 'react';
import type { ReactNode } from 'react';
import FilmTuningSection from '../DebugPanel/FilmTuningSection/FilmTuningSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectFilm } from '../../state/settings/selectors';
import {
  setFilmEnabled,
  setFilmLetterbox,
  tuneFilmGlow,
  tuneFilmGrade,
} from '../../state/settings/core/filmSlice';
import type { FilmGrade } from '../../@types/settings/FilmGrade';
import type { FilmGlow } from '../../@types/settings/FilmGlow';

function FilmTuningSectionContainer(): ReactNode {
  const dispatch = useAppDispatch();
  const { enabled, letterbox, grade, glow } = useAppSelector(selectFilm);

  const onEnabledChange = useCallback((on: boolean) => dispatch(setFilmEnabled(on)), [dispatch]);
  const onLetterboxChange = useCallback(
    (on: boolean) => dispatch(setFilmLetterbox(on)),
    [dispatch],
  );
  const onGradeChange = useCallback(
    (tuning: Partial<FilmGrade>) => dispatch(tuneFilmGrade(tuning)),
    [dispatch],
  );
  const onGlowChange = useCallback(
    (tuning: Partial<FilmGlow>) => dispatch(tuneFilmGlow(tuning)),
    [dispatch],
  );

  return (
    <FilmTuningSection
      enabled={enabled}
      letterbox={letterbox}
      grade={grade}
      glow={glow}
      onEnabledChange={onEnabledChange}
      onLetterboxChange={onLetterboxChange}
      onGradeChange={onGradeChange}
      onGlowChange={onGlowChange}
    />
  );
}

export default memo(FilmTuningSectionContainer);
