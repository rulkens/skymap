// src/components/containers/ScaleBarContainer.tsx
/**
 * ScaleBarContainer — store boundary for the field-of-view scale readout.
 *
 * Owns the `selectScale` read so the presentational `ScaleBar` imports
 * nothing from `store/` or `state/`; `memo` keeps a scale tick from
 * re-rendering the rest of the HUD stack.
 */

import { memo } from 'react';
import { ScaleBar } from '../ScaleBar/ScaleBar';
import { useAppSelector } from '../../store/hooks';
import { selectScale } from '../../state/engine/selectors';

function ScaleBarContainer(): React.ReactElement {
  const scale = useAppSelector(selectScale);
  return <ScaleBar scale={scale} />;
}

export default memo(ScaleBarContainer);
