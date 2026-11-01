/**
 * SatellitesSectionContainer — store boundary for the satellites section. Both switches write
 * through the generic `setVisibility`, the same path the "Labels & guides" rows take, so the
 * cluster needs no reducer of its own.
 */

import { memo, useCallback } from 'react';
import SatellitesSection from './SatellitesSection';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { selectSatellites } from '../state/satellites/selectors';
import { setVisibility } from '../../../state/settings/setVisibilityAction';
import type { SatelliteClass } from '../../../@types/satellites/SatelliteClass';

function SatellitesSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const { enabled, items } = useAppSelector(selectSatellites);
  const onToggleMaster = useCallback(
    (on: boolean) => dispatch(setVisibility({ cluster: 'satellites', field: 'enabled', on })),
    [dispatch],
  );
  const onToggleClass = useCallback(
    (item: SatelliteClass, on: boolean) =>
      dispatch(setVisibility({ cluster: 'satellites', item, field: 'enabled', on })),
    [dispatch],
  );
  return (
    <SatellitesSection
      enabled={enabled}
      items={items}
      onToggleMaster={onToggleMaster}
      onToggleClass={onToggleClass}
    />
  );
}

export default memo(SatellitesSectionContainer);
