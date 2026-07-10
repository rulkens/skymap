/**
 * BODY_FOCUS_PREFIX — the durable `#focus=<id>` prefix for a seeded scene body.
 *
 * A body's focus id is `body-<seedId>` (e.g. `body-earth`). The prefix matters
 * because a bare seed id like `earth` is a valid famous-id character class, so
 * without a distinct prefix `resolveFocusId`'s famous fallback would try (and
 * fail) to resolve `earth` as a catalogued galaxy. The `body-` prefix routes it
 * to the body branch first.
 *
 * This is the ONE canonical home for that literal: the encoders
 * (`focusIdForRow`, `focusIdOf`) prepend it and the decoder (`resolveFocusId`)
 * strips it, so the round-trip can't drift — change the spelling here and every
 * side moves together. Mirrors `milkyWayFocusId`'s shared-literal pattern.
 */

export const BODY_FOCUS_PREFIX = 'body-';
