/**
 * STAR_FOCUS_PREFIX — the durable `#focus=<id>` prefix for a picked survey star
 * (`star-<recordIndex>`, e.g. `star-42`). Without it a bare integer suffix would
 * slip through the composed resolver's famous-galaxy branch first. The ONE
 * canonical home for the literal: the resolver's `focusIdOf`/`resolveFocusId`
 * both import it, so the round-trip can't drift. Mirrors `bodyFocusId`.
 */

export const STAR_FOCUS_PREFIX = 'star-';
