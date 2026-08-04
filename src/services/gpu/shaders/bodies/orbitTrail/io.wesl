// orbitTrail/io.wesl — shared inter-stage struct for the instanced screen-space
// conic orbit trail. Imported by orbitTrail/vertex.wesl and
// orbitTrail/fragment.wesl.
//
// One instance = one orbit, drawn by 'vsRibbon' — a screen-space ribbon
// hugging the projected ellipse across its CPU-clipped in-front-of-camera
// arc. The fragment stage reads its own '@builtin(position)' pixel and
// evaluates the projected conic analytically from 'Ginv' (spec 3.3);
// 'VSOut' is the contract between vertex and fragment.
//
// ## Why the struct lives here
//
// One authoritative inter-stage declaration makes vertex/fragment @location
// drift structurally impossible — the same reasoning 'planet/io.wesl' states.
// EVERY varying below is per-orbit constant (the three
// 'Ginv' columns, the tint, the eccentricity, the mean anomaly), so all are
// '@interpolate(flat)': there is nothing to interpolate across the ribbon's
// own vertices, and declaring the flat qualifier once here means it cannot
// silently diverge between the stages.
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
};

// Per-instance vertex input, matching the TS pipeline's instance-buffer
// descriptor byte-for-byte (see orbitTrailRenderer.ts): 80 bytes of conic +
// tint data, 48 bytes of clip-space conic basis 'vsRibbon' walks per sample
// to trace the ellipse, then 8 bytes of visible-arc interval — 136 total.
struct OrbitInstance {
  // Ginv columns (.xyz used, .w pad) — see vertex.wesl's 'vsRibbon' doc.
  @location(1) ginv0: vec4<f32>,
  @location(2) ginv1: vec4<f32>,
  @location(3) ginv2: vec4<f32>,
  @location(4) params: vec4<f32>,   // color.rgb, eccentricity
  @location(5) phase: vec4<f32>,    // meanAnomalyRad, alpha, viewportPx.w, viewportPx.h
  // Clip-space conic basis: p(E) = cc + cos(E)*ac + sin(E)*bc traces the
  // projected ellipse in (clip.x, clip.y, clip.w) as E runs 0..2*PI.
  @location(6) cc: vec4<f32>,       // clip basis: centre  (x, y, w, pad)
  @location(7) ac: vec4<f32>,       // clip basis: semi-major
  @location(8) bc: vec4<f32>,       // clip basis: semi-minor
  // The CPU-clipped in-front-of-camera arc (composeOrbitConic, closed form):
  // eStart, eSpan. vsRibbon samples ONLY inside it, so no sample is ever
  // behind the camera; eSpan == TAU means the whole orbit (wrap the strip).
  @location(9) arc: vec2<f32>,
};
