// src/components/containers/LoadingBarContainer.tsx
/**
 * LoadingBarContainer — store boundary for the load-progress strip.
 *
 * Owns the `selectLoadProgress` read so the presentational `LoadingBar`
 * imports nothing from `store/` or `state/`; `memo` keeps a progress tick
 * from re-rendering the rest of the HUD stack.
 */

import { memo } from 'react';
import { LoadingBar } from '../LoadingBar/LoadingBar';
import { useAppSelector } from '../../store/hooks';
import { selectLoadProgress } from '../../state/engine/selectors';

function LoadingBarContainer(): React.ReactElement {
  const loadProgress = useAppSelector(selectLoadProgress);
  return <LoadingBar progress={loadProgress} />;
}

export default memo(LoadingBarContainer);
