/** FilmGlowTuningSectionContainer — store boundary for the DebugPanel film-glow board. */

import { memo, useCallback } from 'react';
import type { ReactNode } from 'react';
import FilmGlowTuningSection from '../DebugPanel/FilmGlowTuningSection/FilmGlowTuningSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectFilm } from '../../state/settings/selectors';
import { tuneFilmGlow } from '../../state/settings/core/filmSlice';
import type { FilmGlow } from '../../@types/settings/FilmGlow';

function FilmGlowTuningSectionContainer(): ReactNode {
  const dispatch = useAppDispatch();
  const { glow } = useAppSelector(selectFilm);

  const onGlowChange = useCallback(
    (tuning: Partial<FilmGlow>) => dispatch(tuneFilmGlow(tuning)),
    [dispatch],
  );

  return <FilmGlowTuningSection glow={glow} onGlowChange={onGlowChange} />;
}

export default memo(FilmGlowTuningSectionContainer);
