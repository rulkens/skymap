/**
 * Days past its orbit fit after which a satellite's card warns that the shown position may be far
 * off. SGP4 drifts by kilometres a day, so a fortnight on, a LEO position can be hundreds of km out.
 */
export const SATELLITE_FIT_WARN_DAYS = 14;
