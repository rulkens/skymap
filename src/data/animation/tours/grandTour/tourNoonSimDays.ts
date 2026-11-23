/**
 * TOUR_NOON_SIM_DAYS — local solar noon at Søndermarken on the tour's date,
 * 2026-09-05: the Sun due south and 41° up (`skyPoseOfBodyAt`). The day after
 * last quarter (09-04 10:19 UTC), the first evening on which the waning Moon is
 * still down once the sky is fully dark (`TOUR_NIGHT_SIM_DAYS`). A fixed date,
 * not the viewer's: Copenhagen has no astronomical night from May to July, and
 * the film must look the same on every run.
 */
import { unixMsToJulianDays } from '../../../../utils/time/unixMsToJulianDays';

export const TOUR_NOON_SIM_DAYS = unixMsToJulianDays(Date.UTC(2026, 8, 5, 11, 9));
