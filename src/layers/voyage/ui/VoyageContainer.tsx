/**
 * VoyageContainer — store boundary for the voyage overlay: the sim instant, the clock profile and
 * the `voyage` cluster in; `setSimDays` (a ship-time scrub, converted through `earthYrOfTau`),
 * `playVoyage` / `pause`, `stepVoyageSpeed`, the effect setters and, for a destination tab, the
 * sibling exhibit's `openExhibit` (a cut, so the camera stays put) out.
 * The ship is re-derived on a 4 Hz interval, as the mission timeline's instant is. The headlight
 * switch is honest as local memory of the last non-zero k: off writes 0, on writes that back.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import Voyage from './Voyage';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { playVoyage } from '../exhibits/playVoyage';
import { selectRoute } from '../state/voyage/selectors';
import {
  setVoyageContraction,
  setVoyageDoppler,
  setVoyageHeadlight,
  stepVoyageSpeed,
} from '../state/voyage/slice';
import { openExhibit } from '../../../state/exhibits/exhibitActions';
import { selectTimeState } from '../../../state/time/selectors';
import { pause, setSimDays } from '../../../state/time/timeSlice';
import { MISSION_SPEEDS } from '../../../data/exhibits/mission/missionSpeeds';
import { JULIAN_YEAR_DAYS } from '../../../data/time/julianYearDays';
import { VOYAGE_DESTINATIONS } from '../../../data/voyage/voyageDestinations';
import { formatMissionSpeed } from '../../../utils/exhibits/mission/formatMissionSpeed';
import { earthYrOfTau } from '../../../utils/relativity/earthYrOfTau';
import { tripOf } from '../../../utils/relativity/tripOf';
import { clockProfileRate } from '../../../utils/time/clockProfileRate';
import { deriveSimDays } from '../../../utils/time/deriveSimDays';
import { voyageReadouts } from '../../../utils/voyage/voyageReadouts';
import { voyageShipState } from '../../../utils/voyage/voyageShipState';
import { voyageTripLy } from '../../../utils/voyage/voyageTripLy';
import type { VoyageSection } from '../@types/VoyageSection';

const REFRESH_MS = 250;
const DESTINATIONS = Object.values(VOYAGE_DESTINATIONS);

export type VoyageContainerProps = {
  readonly data: VoyageSection;
};

function VoyageContainer({ data }: VoyageContainerProps): ReactNode {
  const dispatch = useAppDispatch();
  const time = useAppSelector(selectTimeState);
  const voyage = useAppSelector(selectRoute);
  const { paused, profile } = time;

  const read = useCallback(() => {
    const now = performance.now();
    return {
      ship: voyageShipState(voyage, deriveSimDays(time, now)),
      profiled: profile !== null && clockProfileRate(profile, now) > 0,
    };
  }, [voyage, time, profile]);
  const [{ ship, profiled }, setReading] = useState(read);
  useEffect(() => {
    const update = () => setReading(read());
    update();
    const id = setInterval(update, REFRESH_MS);
    return () => clearInterval(id);
  }, [read]);

  const lastHeadlight = useRef(voyage.headlight > 0 ? voyage.headlight : 1);
  useEffect(() => {
    if (voyage.headlight > 0) lastHeadlight.current = voyage.headlight;
  }, [voyage.headlight]);

  const destination = voyage.destination === null ? null : VOYAGE_DESTINATIONS[voyage.destination];
  const tripLy = destination === null ? 0 : voyageTripLy(destination);
  const tauTotalYr = useMemo(() => tripOf(tripLy).tauTotalYr, [tripLy]);
  const { launchDays } = voyage;

  const onSeekTau = useCallback(
    (tauYr: number) => {
      if (launchDays === null) return;
      const simDays = launchDays + earthYrOfTau(tripLy, tauYr) * JULIAN_YEAR_DAYS;
      dispatch(setSimDays({ simDays, nowMs: performance.now() }));
    },
    [dispatch, launchDays, tripLy],
  );
  const onPlayPause = useCallback(
    () => dispatch(paused ? playVoyage() : pause({ nowMs: performance.now() })),
    [dispatch, paused],
  );

  // The hold launches the trip as the exhibit opens; until then there is nothing to read.
  if (destination === null || ship === null) return null;
  return (
    <Voyage
      heading={data.heading}
      destinations={DESTINATIONS}
      selectedId={destination.id}
      tauYr={ship.tauYr}
      tauTotalYr={tauTotalYr}
      readouts={voyageReadouts(destination, ship)}
      clock={{
        paused,
        rateLabel: formatMissionSpeed(voyage.speed),
        profiled,
        atSlowest: voyage.speed <= MISSION_SPEEDS[0]!,
        atFastest: voyage.speed >= MISSION_SPEEDS.at(-1)!,
      }}
      effects={{
        contraction: voyage.contraction,
        doppler: voyage.doppler,
        headlight: voyage.headlight > 0,
      }}
      onSelect={(id) => dispatch(openExhibit({ id: `voyage-${id}`, entry: 'cut' }))}
      onSeekTau={onSeekTau}
      onPlayPause={onPlayPause}
      onSlower={() => dispatch(stepVoyageSpeed({ step: -1 }))}
      onFaster={() => dispatch(stepVoyageSpeed({ step: 1 }))}
      onContraction={(on) => dispatch(setVoyageContraction(on))}
      onDoppler={(on) => dispatch(setVoyageDoppler(on))}
      onHeadlight={(on) => dispatch(setVoyageHeadlight(on ? lastHeadlight.current : 0))}
    />
  );
}

export default memo(VoyageContainer);
