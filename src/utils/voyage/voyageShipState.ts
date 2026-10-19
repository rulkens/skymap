/** voyageShipState — the ship at sim instant `simDays` (Earth time), or null before a trip is set and launched. */

import type { ShipState } from '../../@types/relativity/ShipState';
import type { VoyageSettings } from '../../layers/voyage/@types/VoyageSettings';
import { JULIAN_YEAR_DAYS } from '../../data/time/julianYearDays';
import { VOYAGE_DESTINATIONS } from '../../data/voyage/voyageDestinations';
import { shipStateAt } from '../relativity/shipStateAt';
import { voyageTripLy } from './voyageTripLy';

export function voyageShipState(voyage: VoyageSettings, simDays: number): ShipState | null {
  if (voyage.destination === null || voyage.launchDays === null) return null;
  const tripLy = voyageTripLy(VOYAGE_DESTINATIONS[voyage.destination]);
  return shipStateAt(tripLy, (simDays - voyage.launchDays) / JULIAN_YEAR_DAYS);
}
