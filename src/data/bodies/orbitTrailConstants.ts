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

// Apparent-size fade band, in on-screen orbit DIAMETER pixels — CPU-side only,
// no WESL twin. Below CULL_PX an orbit is deep sub-pixel noise (aliasing, not a
// legible path), so it is dropped from the draw entirely; from CULL_PX up to
// FULL_PX its brightness ramps in, so it does not pop into existence.
export const CULL_PX = 10;
export const FULL_PX = 20;
