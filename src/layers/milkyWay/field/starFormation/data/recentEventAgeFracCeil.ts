/**
 * Fraction ceiling — age01 for catalog events, `(steps - birthStep) / steps`
 * for fluid ones — past which an event ages out of "recent" for the DIG
 * population count. Roughly double `HII_AGE_GATE`: the exposed phase this
 * bounded stays visible several times longer than the HII phase itself that
 * preceded it — an eyeballed multiple, not a measurement.
 */
export const RECENT_EVENT_AGE_FRAC_CEIL = 0.75;
