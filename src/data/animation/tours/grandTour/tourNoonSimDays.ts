/**
 * TOUR_NOON_SIM_DAYS — local solar noon in Søndermarken on the tour's date,
 * 2026-10-10 (12.52° E: 11:10 UTC by longitude, less the ~13 min equation of
 * time). The date is a new Moon, so the night that follows is moonless and the
 * Milky Way stands high through Cygnus by 20:00 UTC (`TOUR_NIGHT_SIM_DAYS`).
 * A fixed date, not the viewer's: Copenhagen has no astronomical night from May
 * to July, and the film must look the same on every run.
 */
import { unixMsToJulianDays } from '../../../../utils/time/unixMsToJulianDays';

export const TOUR_NOON_SIM_DAYS = unixMsToJulianDays(Date.UTC(2026, 9, 10, 10, 57));
