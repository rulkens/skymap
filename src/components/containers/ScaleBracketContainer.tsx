/**
 * ScaleBracketContainer — store boundary for the phone scale legend. Reads the
 * same `selectScale` the desktop ScaleBar does and shows the bracket for two
 * seconds after the label or width last changed; while standing, the lens and
 * the spot instead, for two seconds after the lens last changed.
 */

import { memo } from 'react';
import ScaleBracket from '../ScaleBracket/ScaleBracket';
import { useAppSelector } from '../../store/hooks';
import { selectScale, selectSkyView } from '../../state/engine/selectors';
import { selectFovYRad } from '../../state/camera/selectors';
import { useRecentlyChanged } from '../../hooks/useRecentlyChanged';
import { fieldLabel } from '../../utils/sky/fieldLabel';
import { spotLatLonLabel } from '../../utils/places/spotLatLonLabel';

const SCALE_VISIBLE_MS = 2000;

function ScaleBracketContainer(): React.ReactElement {
  const scale = useAppSelector(selectScale);
  const view = useAppSelector(selectSkyView);
  const fovYRad = useAppSelector(selectFovYRad);
  const standing =
    view === null ? null : { field: fieldLabel(fovYRad), spot: spotLatLonLabel(view.spot) };
  const changing = useRecentlyChanged(
    standing === null ? `${scale.label}|${scale.widthPx}` : standing.field,
    SCALE_VISIBLE_MS,
  );
  return <ScaleBracket scale={scale} standing={standing} visible={changing} />;
}

export default memo(ScaleBracketContainer);
