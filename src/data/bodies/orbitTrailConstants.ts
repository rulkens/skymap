/**
 * Orbit-trail constants the CPU side needs. The first two are TS twins of
 * `orbitTrail/constants.wesl` values.
 * `?static` WESL linking injects no values, so each pair is hand-mirrored and
 * pinned by `tests/services/gpu/shaders/orbitTrailConstants.parity.test.ts`.
 * SEGMENTS sizes the ribbon draw call (6 vertices per E-step); MAX_OCCLUDERS
 * sizes the per-frame occluder-sphere uniform the fragment loops over.
 */

export const RIBBON_SEGMENTS = 96; // MUST equal SEGMENTS in orbitTrail/constants.wesl
export const MAX_ORBIT_OCCLUDERS = 16; // MUST equal MAX_OCCLUDERS in orbitTrail/constants.wesl

// Apparent-size fade band, in on-screen orbit DIAMETER pixels (no WESL twin):
// below CULL_PX an orbit is sub-pixel aliasing rather than a legible path and
// is dropped, then ramps in over CULL_PX→FULL_PX so it does not pop.
export const CULL_PX = 10;
export const FULL_PX = 20;
