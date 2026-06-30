/**
 * pathDefaults — the default flyPath pacing, in one place.
 *
 * A flythrough authored with no pacing knobs should already feel right, so the
 * `flyPath` helper stamps these onto every node and `buildPathTrack` falls back
 * to the align value for direct callers. They were tuned by eye against the
 * clip-path inspector's deterministic replay; change them here to reshape every
 * un-pinned flythrough at once.
 */

/** Seconds to blend the live orientation into the down-the-path aim at the start. */
export const DEFAULT_ALIGN_SEC = 1.35;

/**
 * Seconds of ease ramp at EACH end of the trapezoidal speed envelope (short
 * accel + long constant-speed cruise + short decel). This is the default
 * envelope; author `rampSec: 0` on a flyPath to opt out and use the named `ease`.
 */
export const DEFAULT_RAMP_SEC = 1.4;
