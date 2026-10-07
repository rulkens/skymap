/**
 * focusCoreFraction — the fraction of a focused structure's apparent radius that
 * its fully-bright core is capped to, so the dimming smoothstep never collapses
 * to a hard ring. Mirrors `FOCUS_CORE_FRACTION` in `lib/focusUniforms.wesl`,
 * pinned by a parity test.
 */

export const FOCUS_CORE_FRACTION = 0.6;
