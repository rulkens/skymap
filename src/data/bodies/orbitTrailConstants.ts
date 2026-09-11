/**
 * TS twins of the `orbitTrail/constants.wesl` values the CPU side needs.
 * `?static` WESL linking injects no values, so each pair is hand-mirrored and
 * pinned by `tests/services/gpu/shaders/orbitTrailConstants.parity.test.ts`.
 * SEGMENTS sizes the ribbon draw call (6 vertices per E-step); MAX_OCCLUDERS
 * sizes the per-frame occluder-sphere uniform the fragment loops over.
 */

export const RIBBON_SEGMENTS = 96; // MUST equal SEGMENTS in orbitTrail/constants.wesl
export const MAX_ORBIT_OCCLUDERS = 16; // MUST equal MAX_OCCLUDERS in orbitTrail/constants.wesl
