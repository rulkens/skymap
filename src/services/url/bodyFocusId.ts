/**
 * BODY_FOCUS_PREFIX — the durable `#focus=<id>` prefix for a seeded scene body
 * (`body-<seedId>`, e.g. `body-earth`). Without it a bare seed id like `earth`
 * would slip through the composed resolver's famous-galaxy branch first. The
 * ONE canonical home for the literal: `focusIdForRow` and the resolver's
 * `focusIdOf`/`resolveFocusId` all import it. Mirrors `milkyWayFocusId`.
 */

export const BODY_FOCUS_PREFIX = 'body-';
