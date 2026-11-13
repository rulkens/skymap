/** LetterboxBarsContainer — store boundary for the letterbox bars: shown while the look and its letterbox are both on. */

import { memo } from 'react';
import type { ReactNode } from 'react';
import LetterboxBars from '../LetterboxBars/LetterboxBars';
import { useAppSelector } from '../../store/hooks';
import { selectFilmLetterboxOn } from '../../state/settings/selectors';

function LetterboxBarsContainer(): ReactNode {
  const on = useAppSelector(selectFilmLetterboxOn);
  return on ? <LetterboxBars /> : null;
}

export default memo(LetterboxBarsContainer);
