/** FilmGradeTuningSectionContainer — store boundary for the DebugPanel film-grade board. */

import { memo, useCallback } from 'react';
import type { ReactNode } from 'react';
import FilmGradeTuningSection from '../DebugPanel/FilmGradeTuningSection/FilmGradeTuningSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectFilm } from '../../state/settings/selectors';
import {
  setFilmEnabled,
  setFilmLetterbox,
  tuneFilmGrade,
} from '../../state/settings/core/filmSlice';
import type { FilmGrade } from '../../@types/settings/FilmGrade';

function FilmGradeTuningSectionContainer(): ReactNode {
  const dispatch = useAppDispatch();
  const { enabled, letterbox, grade } = useAppSelector(selectFilm);

  const onEnabledChange = useCallback((on: boolean) => dispatch(setFilmEnabled(on)), [dispatch]);
  const onLetterboxChange = useCallback(
    (on: boolean) => dispatch(setFilmLetterbox(on)),
    [dispatch],
  );
  const onGradeChange = useCallback(
    (tuning: Partial<FilmGrade>) => dispatch(tuneFilmGrade(tuning)),
    [dispatch],
  );

  return (
    <FilmGradeTuningSection
      enabled={enabled}
      letterbox={letterbox}
      grade={grade}
      onEnabledChange={onEnabledChange}
      onLetterboxChange={onLetterboxChange}
      onGradeChange={onGradeChange}
    />
  );
}

export default memo(FilmGradeTuningSectionContainer);
