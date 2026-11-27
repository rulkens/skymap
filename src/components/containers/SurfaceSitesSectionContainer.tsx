/**
 * SurfaceSitesSectionContainer — store boundary for the DebugPanel's "Surface sites" board. The
 * row tunes the FOCUSED body: the one the camera orbits and the site arm engages on.
 */

import { memo, useCallback, type ReactNode } from 'react';
import SurfaceSitesSection from '../DebugPanel/SurfaceSitesSection/SurfaceSitesSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { setSiteSeatOffsetM } from '../../state/settings/core/debugSlice';
import { selectFocusRow } from '../../state/selection/selectors';
import { siteBodyOfRow } from '../../utils/selection/siteBodyOfRow';

function SurfaceSitesSectionContainer(): ReactNode {
  const dispatch = useAppDispatch();
  const site = useAppSelector((s) => siteBodyOfRow(selectFocusRow(s)));
  const seatOffsetM = useAppSelector((s) =>
    site === null ? 0 : (s.settings.debug.siteSeatOffsetsM[site.id] ?? 0),
  );
  const onSeatOffsetChange = useCallback(
    (offsetM: number) => {
      if (site !== null) dispatch(setSiteSeatOffsetM({ siteId: site.id, offsetM }));
    },
    [dispatch, site],
  );
  return (
    <SurfaceSitesSection
      siteLabel={site?.label ?? null}
      seatOffsetM={seatOffsetM}
      onSeatOffsetChange={onSeatOffsetChange}
    />
  );
}

export default memo(SurfaceSitesSectionContainer);
