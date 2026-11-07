/**
 * ScaleBarContainer — store boundary for the scale readout: the distance legend, or while
 * standing the live lens (`camera.fovYRad`, not the sky view's rounded copy) and the spot.
 * `memo` keeps a scale tick from re-rendering the rest of the HUD stack.
 */

import { memo } from 'react';
import ScaleBar from '../ScaleBar/ScaleBar';
import { useAppSelector } from '../../store/hooks';
import { selectScale, selectSkyView } from '../../state/engine/selectors';
import { selectFovYRad } from '../../state/camera/selectors';
import { standingReadout } from '../../utils/sky/standingReadout';

function ScaleBarContainer(): React.ReactElement {
  const scale = useAppSelector(selectScale);
  const view = useAppSelector(selectSkyView);
  const fovYRad = useAppSelector(selectFovYRad);
  const standing = standingReadout(view, fovYRad);
  return <ScaleBar scale={scale} standing={standing} />;
}

export default memo(ScaleBarContainer);
