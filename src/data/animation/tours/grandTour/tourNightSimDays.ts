/**
 * TOUR_NIGHT_SIM_DAYS — full night over Søndermarken on the tour's date,
 * 2026-09-05 20:45 UTC: half an hour past astronomical dusk (20:12), Cygnus on
 * the meridian by the zenith, so the Milky Way runs overhead from Cassiopeia to
 * Sagittarius, and the Moon, a third lit, not up until 21:04. Every Earth beat
 * after the opening snaps here on entry.
 */
import { unixMsToJulianDays } from '../../../../utils/time/unixMsToJulianDays';

export const TOUR_NIGHT_SIM_DAYS = unixMsToJulianDays(Date.UTC(2026, 8, 5, 20, 45));
