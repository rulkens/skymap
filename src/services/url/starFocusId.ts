/**
 * STAR_FOCUS_PREFIX — the durable `#focus=<id>` prefix for a picked survey star.
 *
 * A star's focus id is `star-<recordIndex>` (e.g. `star-42`), where the suffix
 * is the bin-stable global star-record index the pick texture names. The prefix
 * matters because a bare integer suffix like `42` would slip through the famous
 * character class, so without a distinct prefix `resolveFocusId`'s famous
 * fallback would try (and fail) to resolve it as a catalogued galaxy. The
 * `star-` prefix routes it to the star branch first.
 *
 * This is the ONE canonical home for that literal: the encoder (`focusIdOf`)
 * prepends it and the decoder (`resolveFocusId`) strips it, so the round-trip
 * can't drift — change the spelling here and both sides move together. Mirrors
 * `bodyFocusId`'s shared-literal pattern.
 */

export const STAR_FOCUS_PREFIX = 'star-';
