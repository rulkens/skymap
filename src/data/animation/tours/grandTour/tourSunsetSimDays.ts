/**
 * TOUR_SUNSET_SIM_DAYS — the Sun's centre on Søndermarken's horizon on the
 * tour's date, 2026-09-05 17:47 UTC, in the west-north-west (`skyPoseOfBodyAt`).
 * Beat 00 turns its tilt from the Sun to the night sky here.
 */
import { unixMsToJulianDays } from '../../../../utils/time/unixMsToJulianDays';

export const TOUR_SUNSET_SIM_DAYS = unixMsToJulianDays(Date.UTC(2026, 8, 5, 17, 47));
