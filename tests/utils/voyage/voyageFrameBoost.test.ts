import { describe, expect, it } from 'vitest';
import { createAppStore } from '../../../src/store/createAppStore';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { JULIAN_YEAR_DAYS } from '../../../src/data/time/julianYearDays';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { VOYAGE_DESTINATIONS } from '../../../src/data/voyage/voyageDestinations';
import { voyageFrameBoost } from '../../../src/utils/voyage/voyageFrameBoost';
import {
  setVoyageContraction,
  setVoyageDestination,
  setVoyageDoppler,
  setVoyageHeadlight,
  setVoyageLaunchDays,
} from '../../../src/layers/voyage/state/voyage/slice';
import { shipStateAt } from '../../../src/utils/relativity/shipStateAt';
import { voyageTripLy } from '../../../src/utils/voyage/voyageTripLy';

function launchedToM31() {
  const { store } = createAppStore();
  store.dispatch(setVoyageDestination('m31'));
  store.dispatch(setVoyageLaunchDays(CONST_J2000));
  return store;
}

describe('voyageFrameBoost', () => {
  it('voyageFrameBoost is null without a destination', () => {
    const { store } = createAppStore();
    store.dispatch(setVoyageLaunchDays(CONST_J2000));
    expect(voyageFrameBoost(store.getState().settings.voyage, CONST_J2000 + 100)).toBeNull();
  });

  it("voyageFrameBoost places the ship along dir at the ship state's xLy", () => {
    const store = launchedToM31();
    const boost = voyageFrameBoost(
      store.getState().settings.voyage,
      CONST_J2000 + 10 * JULIAN_YEAR_DAYS,
    )!;
    const ship = shipStateAt(voyageTripLy(VOYAGE_DESTINATIONS.m31), 10);
    const [mx, my, mz] = VOYAGE_DESTINATIONS.m31.positionMpc;
    const towardM31 = [mx, my, mz].map((c) => c / Math.hypot(mx, my, mz));

    boost.dir.forEach((c, i) => expect(c).toBeCloseTo(towardM31[i]!, 12));
    boost.shipMpc.forEach((c, i) =>
      expect(c).toBeCloseTo(towardM31[i]! * ship.xLy * SCALE_UNITS.LY_TO_MPC, 12),
    );
    expect(boost.gamma).toBe(ship.gamma);
    expect(boost.beta).toBe(ship.beta);
  });

  it('voyageFrameBoost reflects the toggles and headlight', () => {
    const store = launchedToM31();
    store.dispatch(setVoyageContraction(false));
    store.dispatch(setVoyageDoppler(false));
    store.dispatch(setVoyageHeadlight(2.5));
    const boost = voyageFrameBoost(
      store.getState().settings.voyage,
      CONST_J2000 + JULIAN_YEAR_DAYS,
    )!;
    expect(boost.contraction).toBe(false);
    expect(boost.doppler).toBe(false);
    expect(boost.headlight).toBe(2.5);
  });
});
