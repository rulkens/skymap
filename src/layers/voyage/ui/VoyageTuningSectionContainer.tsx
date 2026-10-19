/**
 * Store boundary for the voyage debug section. "Earth-years since launch" writes the launch
 * instant (launchDays = now − years), never the clock, so a paused scene re-frames in place;
 * picking a trip with none launched launches it now. Plain handlers, no `useCallback`: the
 * presentational section is not memoised, so stable identities would buy nothing.
 */

import { memo } from 'react';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { selectTimeState } from '../../../state/time/selectors';
import { deriveSimDays } from '../../../utils/time/deriveSimDays';
import { JULIAN_YEAR_DAYS } from '../../../data/time/julianYearDays';
import { voyageShipState } from '../../../utils/voyage/voyageShipState';
import { selectRoute } from '../state/voyage/selectors';
import {
  setVoyageContraction,
  setVoyageDestination,
  setVoyageDoppler,
  setVoyageHeadlight,
  setVoyageLaunchDays,
} from '../state/voyage/slice';
import { VoyageTuningSection } from './VoyageTuningSection';

function VoyageTuningSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const voyage = useAppSelector(selectRoute);
  const time = useAppSelector(selectTimeState);
  const simDays = deriveSimDays(time, performance.now());

  return (
    <VoyageTuningSection
      voyage={voyage}
      earthYr={voyage.launchDays === null ? null : (simDays - voyage.launchDays) / JULIAN_YEAR_DAYS}
      ship={voyageShipState(voyage, simDays)}
      onDestination={(id) => {
        dispatch(setVoyageDestination(id));
        if (id !== null && voyage.launchDays === null) {
          dispatch(setVoyageLaunchDays(deriveSimDays(time, performance.now())));
        }
      }}
      onEarthYr={(years) =>
        dispatch(
          setVoyageLaunchDays(deriveSimDays(time, performance.now()) - years * JULIAN_YEAR_DAYS),
        )
      }
      onHeadlight={(k) => dispatch(setVoyageHeadlight(k))}
      onContraction={(on) => dispatch(setVoyageContraction(on))}
      onDoppler={(on) => dispatch(setVoyageDoppler(on))}
    />
  );
}

export default memo(VoyageTuningSectionContainer);
