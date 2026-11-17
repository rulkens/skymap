/**
 * ScaleBarContainer — store boundary for the field-of-view scale readout; none while standing,
 * where a distance means nothing.
 *
 * Owns the `selectScale` read so the presentational `ScaleBar` imports
 * nothing from `store/` or `state/`; `memo` keeps a scale tick from
 * re-rendering the rest of the HUD stack.
 */

import { memo, useRef } from 'react';
import { ScaleBar } from '../ScaleBar/ScaleBar';
import { useAppSelector } from '../../store/hooks';
import { selectScale } from '../../state/engine/selectors';
import { selectUiStackHidden } from '../../state/ui/selectors';
import { useViewCoverRow } from '../../hooks/useViewCoverRow';
import { selectSkyView } from '../../state/sky/selectors/selectSkyView';

function ScaleBarContainer(): React.ReactElement | null {
  const scale = useAppSelector(selectScale);
  const uiStackHidden = useAppSelector(selectUiStackHidden);
  const standing = useAppSelector(selectSkyView) !== null;
  const ref = useRef<HTMLDivElement>(null);
  useViewCoverRow(ref, 'scaleBar', 'bottom', !uiStackHidden && !standing);
  return standing ? null : <ScaleBar ref={ref} scale={scale} />;
}

export default memo(ScaleBarContainer);
