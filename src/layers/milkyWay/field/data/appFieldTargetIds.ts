import type { AppFieldTargetId } from '../@types/AppFieldTargetId';
import { FIELD_TARGET_IDS } from './fieldTargetIds';

/**
 * The field targets the app allocates: all but `extras`. The app's tuning
 * carries no extras (`milkyWayFieldHostTuningFor`), so nothing would draw
 * there, and at its divisor of 1 the row held ~66 MB at 4K.
 */
export const APP_FIELD_TARGET_IDS = FIELD_TARGET_IDS.filter(
  (id): id is AppFieldTargetId => id !== 'extras',
);
