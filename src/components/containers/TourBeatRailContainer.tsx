// src/components/containers/TourBeatRailContainer.tsx
/**
 * TourBeatRailContainer — store boundary for the tour progress rail.
 *
 * Reads the memoized beat-title list + the current beat index and hands them
 * to the presentational `TourBeatRail`. No dispatches — the rail is passive
 * orientation (hover reveals a title; nothing is clickable).
 *
 * A sibling of `TourOverlayContainer`, not a child: the rail needs data the
 * overlay never looks at (the title list), and shares none of the overlay's
 * dwell-timing behaviour, so folding it in would be pure prop drilling. App
 * mounts this under the same `selectTourActive` gate — when mounted, a tour
 * is running.
 */

import { memo } from 'react';
import TourBeatRail from '../TourBeatRail/TourBeatRail';
import { useAppSelector } from '../../store/hooks';
import { selectTourBeatTitles, selectTourBeatIndex } from '../../state/tour/selectors';

function TourBeatRailContainer(): React.ReactElement {
  const titles = useAppSelector(selectTourBeatTitles);
  const index = useAppSelector(selectTourBeatIndex);

  return <TourBeatRail titles={titles} index={index} />;
}

export default memo(TourBeatRailContainer);
