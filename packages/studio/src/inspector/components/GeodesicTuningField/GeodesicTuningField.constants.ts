import { GEODESIC_EASES } from '../../../../../../src/data/camera/focusMoveDefaults';

/** The tuning stores its bounds in ms; the rows speak seconds. */
export const MS_PER_S = 1000;

/** Monotone eases only: an overshoot would fly past the target and back. */
export const GEODESIC_EASE_OPTIONS = GEODESIC_EASES.map((value) => ({ value, text: value }));
