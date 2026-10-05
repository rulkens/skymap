/**
 * STAR_FOCUS_PREFIX — the durable `#focus=<id>` prefix for any star: a seed id
 * for a seeded catalog (`star-sirius`) or a record index for the survey
 * (`star-42`). Without it a bare suffix would slip through the composed
 * resolver's famous-galaxy branch first. The ONE canonical home for the
 * literal, imported by `encodeStarFocusId`/`decodeStarFocusId` and the row's
 * `claims`, so the round-trip can't drift. Mirrors `bodyFocusId`.
 */

export const STAR_FOCUS_PREFIX = 'star-';
