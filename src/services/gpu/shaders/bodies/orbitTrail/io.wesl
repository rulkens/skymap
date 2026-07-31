// orbitTrail/io.wesl — shared inter-stage struct for the instanced screen-space
// conic orbit trail. Imported by orbitTrail/vertex.wesl and
// orbitTrail/fragment.wesl.
//
// One instance = one orbit, drawn by ONE of two vertex entry points sharing
// this file's 'OrbitInstance' input and 'VSOut' output: 'vs' (an oversized
// fullscreen triangle; the fragment discards off-stroke pixels) or 'vsRibbon'
// (a screen-space ribbon hugging the projected ellipse). Either way the
// fragment stage reads its own '@builtin(position)' pixel and evaluates the
// projected conic analytically from 'Ginv' (spec 3.3); 'VSOut' is the contract
// between vertex and fragment, and neither entry point changes it.
//
// ## Why the struct lives here
//
// One authoritative inter-stage declaration makes vertex/fragment @location
// drift structurally impossible — the same reasoning 'planet/io.wesl' states.
// EVERY varying below is per-orbit constant (the three
// 'Ginv' columns, the tint, the eccentricity, the mean anomaly), so all are
// '@interpolate(flat)': there is nothing to interpolate under either vertex
// stage, and declaring the flat qualifier once here means it cannot silently
// diverge between the stages.
//
// ## Why Ginv streams as three vec3 columns
//
// WESL has no mat3x3 inter-stage type, so the pixel->plane inverse homography
// 'Ginv' is carried as its three columns and reassembled in the fragment with
// 'mat3x3<f32>(g0, g1, g2)' — the columns arrive from the per-instance vertex
// attributes (loc1..3, .xyz of each padded vec4). See orbitTrail/vertex.wesl.

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  // The three columns of the pixel->plane inverse homography 'Ginv'. Constant
  // per orbit, forwarded flat; reassembled into a mat3x3<f32> in the fragment.
  @location(0) @interpolate(flat) ginv0: vec3<f32>,
  @location(1) @interpolate(flat) ginv1: vec3<f32>,
  @location(2) @interpolate(flat) ginv2: vec3<f32>,
  // Per-orbit trail tint — one solid additive colour per orbit.
  @location(3) @interpolate(flat) color: vec3<f32>,
  // Orbit eccentricity 'e', for the forward Kepler map E -> M in the fragment.
  @location(4) @interpolate(flat) eccentricity: f32,
  // The body's mean anomaly at the scene epoch (J2000) — the phase the trail
  // brightness fades away from.
  @location(5) @interpolate(flat) meanAnomaly: f32,
  // Per-orbit apparent-size fade (CPU-side): 1 well above the cull threshold,
  // ramping to 0 as the orbit shrinks toward it. Multiplies the final colour.
  @location(6) @interpolate(flat) alpha: f32,
  // The gradient minors that make the fragment's Sampson gradient AFFINE in the
  // pixel, hoisted to CPU f64 to kill the old difference-of-products
  // cancellation (see composeOrbitConic's header). 'minorS' = (M1, M2, M3)
  // drives d s/d p, 'minorT' = (M4, M5, M6) drives d t/d p; the fragment
  // evaluates each numerator as a plain multiply-add. Per-orbit constant, flat.
  @location(7) @interpolate(flat) minorS: vec3<f32>,
  @location(8) @interpolate(flat) minorT: vec3<f32>,
};

// Per-instance vertex input, declared ONCE so 'vs' and 'vsRibbon' cannot drift
// apart on attribute @location. Matches the TS pipeline's instance-buffer
// descriptor byte-for-byte (see orbitTrailRenderer.ts) — 112 bytes of conic +
// tint + gradient data that 'vs' needs, followed by 48 bytes of clip-space
// conic basis that only 'vsRibbon' needs, to walk the ellipse per sample.
struct OrbitInstance {
  // Ginv columns (.xyz used, .w pad) — see vertex.wesl's 'vs' doc.
  @location(1) ginv0: vec4<f32>,
  @location(2) ginv1: vec4<f32>,
  @location(3) ginv2: vec4<f32>,
  @location(4) params: vec4<f32>,   // color.rgb, eccentricity
  @location(5) phase: vec4<f32>,    // meanAnomalyRad, alpha, viewportPx.w, viewportPx.h
  @location(6) minorS: vec4<f32>,
  @location(7) minorT: vec4<f32>,
  // Clip-space conic basis: p(E) = cc + cos(E)*ac + sin(E)*bc traces the
  // projected ellipse in (clip.x, clip.y, clip.w) as E runs 0..2*PI. Only
  // 'vsRibbon' reads these; 'vs' ignores them.
  @location(8) cc: vec4<f32>,       // clip basis: centre  (x, y, w, pad)
  @location(9) ac: vec4<f32>,       // clip basis: semi-major
  @location(10) bc: vec4<f32>,      // clip basis: semi-minor
};
