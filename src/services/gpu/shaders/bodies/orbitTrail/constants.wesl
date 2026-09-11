// orbitTrail/constants.wesl — shared tunables for the ribbon impostor's
// vertex and fragment stages. SEGMENTS and MAX_OCCLUDERS have TS twins in
// src/data/bodies/orbitTrailConstants.ts (the draw call needs SEGMENTS * 6,
// the uniform buffer needs the sphere capacity); '?static' linking injects no
// values, so a parity test pins each pair — see
// tests/services/gpu/shaders/orbitTrailConstants.parity.test.ts.

// Stroke width in PIXELS — the plane-space distance is converted to a pixel
// distance, so this is a fixed screen constant at every zoom (spec 3.3).
const STROKE_PX: f32 = 2.5;
const SEGMENTS: u32 = 96u;    // E-steps around the ribbon; 6 verts each
const MARGIN_PX: f32 = 2.0;   // f32 vertex noise + per-vertex-normal slack ONLY (see Task 4)
const MAX_OCCLUDERS: u32 = 16u; // occluder-sphere uniform capacity (fragment)

// Radians of eccentric anomaly E within TAU counted as "closed". Unrelated to
// composeOrbitConic's epsW (a relative clip-w fraction) despite the same 1e-4.
const CLOSED_SPAN_EPS: f32 = 1e-4;
