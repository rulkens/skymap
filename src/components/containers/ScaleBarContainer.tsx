/**
 * ScaleBarContainer — store boundary for the field-of-view scale readout.
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

function ScaleBarContainer(): React.ReactElement {
  const scale = useAppSelector(selectScale);
  const uiStackHidden = useAppSelector(selectUiStackHidden);
  const ref = useRef<HTMLDivElement>(null);
  useViewCoverRow(ref, 'scaleBar', 'bottom', !uiStackHidden);
  return <ScaleBar ref={ref} scale={scale} />;
}

export default memo(ScaleBarContainer);
