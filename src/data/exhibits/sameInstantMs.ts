/**
 * Half a second: a clock just set to an event's instant must not count that event as still
 * ahead or behind, and the Julian-day round trip loses tens of microseconds.
 */
export const SAME_INSTANT_MS = 500;
