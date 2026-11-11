/**
 * ScaleBarContainer — store boundary for the field-of-view scale readout; none while standing,
 * where a distance means nothing.
 *
 * Owns the `selectScale` read so the presentational `ScaleBar` imports
 * nothing from `store/` or `state/`; `memo` keeps a scale tick from
 * re-rendering the rest of the HUD stack.
 */

import { memo } from 'react';
import { ScaleBar } from '../ScaleBar/ScaleBar';
import { useAppSelector } from '../../store/hooks';
import { selectScale, selectSkyView } from '../../state/engine/selectors';

function ScaleBarContainer(): React.ReactElement | null {
  const scale = useAppSelector(selectScale);
  const standing = useAppSelector(selectSkyView) !== null;
  return standing ? null : <ScaleBar scale={scale} />;
}

export default memo(ScaleBarContainer);
