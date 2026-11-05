/**
 * TOUR_NIGHT_SIM_DAYS — full astronomical night over Søndermarken on the tour's
 * date, 2026-10-10 20:00 UTC: well past astronomical dusk, no Moon (new Moon
 * that day), the Milky Way overhead from Cassiopeia to Cygnus. Every Earth beat
 * after the opening snaps here on entry.
 */
import { unixMsToJulianDays } from '../../../../utils/time/unixMsToJulianDays';

export const TOUR_NIGHT_SIM_DAYS = unixMsToJulianDays(Date.UTC(2026, 9, 10, 20, 0));
