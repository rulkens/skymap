/** Store boundary for the DebugPanel's satellite colours. */

import { memo, useCallback } from 'react';
import SatelliteColorsSection from './SatelliteColorsSection';
import { useAppDispatch, useAppSelector } from '../../../../store/hooks';
import { selectSatelliteColors } from '../../state/satelliteColors/selectors';
import { resetSatelliteColors, setSatelliteColor } from '../../state/satelliteColors/slice';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { SatelliteProfileId } from '../../points/@types/SatelliteProfileId';

function SatelliteColorsSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const colors = useAppSelector(selectSatelliteColors);
  const onChange = useCallback(
    (id: SatelliteProfileId, color: Vec3) => dispatch(setSatelliteColor({ id, color })),
    [dispatch],
  );
  const onReset = useCallback(() => dispatch(resetSatelliteColors()), [dispatch]);

  return <SatelliteColorsSection colors={colors} onChange={onChange} onReset={onReset} />;
}

export default memo(SatelliteColorsSectionContainer);
