/**
 * ScaleBracketContainer — store boundary for the phone scale legend. Reads the
 * same `selectScale` the desktop ScaleBar does and shows the bracket for two
 * seconds after the label or width last changed.
 */

import { memo } from 'react';
import ScaleBracket from '../ScaleBracket/ScaleBracket';
import { useAppSelector } from '../../store/hooks';
import { selectScale } from '../../state/engine/selectors';
import { useRecentlyChanged } from '../../hooks/useRecentlyChanged';

const SCALE_VISIBLE_MS = 2000;

function ScaleBracketContainer(): React.ReactElement {
  const scale = useAppSelector(selectScale);
  const changing = useRecentlyChanged(`${scale.label}|${scale.widthPx}`, SCALE_VISIBLE_MS);
  return <ScaleBracket scale={scale} visible={changing} />;
}

export default memo(ScaleBracketContainer);
