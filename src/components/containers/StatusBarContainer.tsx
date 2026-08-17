// src/components/containers/StatusBarContainer.tsx
/**
 * StatusBarContainer — store boundary for the engine status readout.
 *
 * Owns the `selectEngineStatus` read so the presentational `StatusBar`
 * imports nothing from `store/` or `state/`; `memo` keeps a status change
 * from re-rendering the rest of the HUD stack.
 */

import { memo } from 'react';
import { StatusBar } from '../StatusBar/StatusBar';
import { useAppSelector } from '../../store/hooks';
import { selectEngineStatus } from '../../state/engine/selectors';

function StatusBarContainer(): React.ReactElement {
  const status = useAppSelector(selectEngineStatus);
  return <StatusBar status={status} />;
}

export default memo(StatusBarContainer);
