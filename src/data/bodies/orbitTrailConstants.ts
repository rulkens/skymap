/**
 * TS twin of SEGMENTS in `orbitTrail/constants.wesl` — the ribbon impostor's
 * per-orbit E-step count. `?static` WESL linking injects no values, so the
 * renderer's draw call (RIBBON_SEGMENTS * 6 vertices, 6 per E-step) needs its
 * own copy; `tests/services/gpu/shaders/orbitTrailConstants.parity.test.ts`
 * pins the pair so they cannot drift apart.
 */

export const RIBBON_SEGMENTS = 96; // MUST equal SEGMENTS in orbitTrail/constants.wesl
