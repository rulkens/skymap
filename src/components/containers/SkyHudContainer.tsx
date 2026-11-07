/**
 * SkyHudContainer — store boundary for the sky HUD. Shown while the camera stands (the sky view
 * readout, D9) and no tour, exhibit or registry clip has the screen. It deliberately ignores
 * camera clips: a search head-turn is one, and the HUD must not blink for it. The clock skips
 * land manual and paused (`manualPausedAtActions`), so the Time bar's "Now" undoes them.
 */

import { memo, useCallback, useMemo, type ReactNode } from 'react';
import SkyHud from '../SkyHud/SkyHud';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { useSimInstant } from '../../hooks/useSimInstant';
import { selectSkyView } from '../../state/engine/selectors';
import { selectTakeoverSource } from '../../state/takeover/selectors';
import { selectSkyBelowHorizon } from '../../state/sky/selectSkyBelowHorizon';
import { selectTimeState } from '../../state/time/selectors';
import { exitTakeover } from '../../state/takeover/takeoverActions';
import { manualPausedAtActions } from '../../state/time/enterManualPausedAt';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { julianDaysToUnixMs } from '../../utils/time/julianDaysToUnixMs';
import { unixMsToJulianDays } from '../../utils/time/unixMsToJulianDays';
import { placeLabel } from '../../utils/places/placeLabel';
import { headingLabel } from '../../utils/sky/headingLabel';
import { altAzFromSpot } from '../../utils/sky/altAzFromSpot';
import { declinationAt } from '../../utils/sky/declinationAt';
import { neverRises } from '../../utils/sky/neverRises';
import { tonightAt } from '../../utils/sky/tonightAt';
import { radToDeg } from '../../utils/math/radToDeg';
import { deriveBodyStates } from '../../services/engine/frame/deriveBodyStates';
import type { Vec3 } from '../../@types/math/Vec3';

const MS_PER_MINUTE = 60_000;
/** The Sun is the heliocentric origin. */
const SUN_MPC: Vec3 = [0, 0, 0];

export type SkyHudContainerProps = {
  readonly phone: boolean;
};

function SkyHudContainer({ phone }: SkyHudContainerProps): ReactNode {
  const dispatch = useAppDispatch();
  const view = useAppSelector(selectSkyView);
  const takeover = useAppSelector(selectTakeoverSource);
  const below = useAppSelector(selectSkyBelowHorizon);
  const time = useAppSelector(selectTimeState);
  const instant = useSimInstant(time);
  const spot = view?.spot ?? null;

  // Up, and setting today: under the midnight sun there is no tonight to skip to.
  const sunSets = useMemo(() => {
    if (spot === null) return false;
    const bodies = deriveBodyStates(unixMsToJulianDays(instant.getTime()));
    const sunAlt = altAzFromSpot(spot, SUN_MPC, bodies).altitudeRad;
    return sunAlt > 0 && !neverRises(-declinationAt(spot.body, SUN_MPC, bodies), spot.latRad);
  }, [spot, instant]);

  const jumpTo = useCallback(
    (simDays: number) => {
      for (const action of manualPausedAtActions(new Date(julianDaysToUnixMs(simDays)))) {
        dispatch(action);
      }
    },
    [dispatch],
  );
  const onLeave = useCallback(() => dispatch(exitTakeover({ restore: true })), [dispatch]);
  // Read the clock at the click, not the minute the HUD last rendered.
  const onSkipToTonight = useCallback(() => {
    if (spot !== null) jumpTo(tonightAt(spot, deriveSimDays(time, performance.now())));
  }, [jumpTo, spot, time]);
  const riseAt = below?.riseAt ?? null;
  const onSkipToRise = useCallback(() => {
    if (riseAt !== null) jumpTo(riseAt);
  }, [jumpTo, riseAt]);

  if (view === null || (takeover !== null && takeover.kind !== 'sky')) return null;

  // The clock reads whole minutes, so the minute holding the rise already counts as risen.
  const risesLater =
    riseAt !== null && instant.getTime() + MS_PER_MINUTE <= julianDaysToUnixMs(riseAt);
  let riseNote: string | null = null;
  if (below?.neverRises) riseNote = 'Never rises from here';
  else if (below !== null && riseAt === null) riseNote = "Doesn't rise in the next two days";

  return (
    <SkyHud
      phone={phone}
      place={placeLabel(view.spot).text}
      azimuthDeg={radToDeg(view.azimuthRad)}
      heading={headingLabel(view.azimuthRad, view.altitudeRad)}
      onLeave={onLeave}
      onSkipToTonight={sunSets ? onSkipToTonight : null}
      onSkipToRise={risesLater ? onSkipToRise : null}
      riseNote={riseNote}
    />
  );
}

export default memo(SkyHudContainer);
