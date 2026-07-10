// orbitRing/io.wesl — shared inter-stage struct for the instanced SDF orbit
// ring. Imported by orbitRing/vertex.wesl and orbitRing/fragment.wesl.
//
// Each orbit ring renders as one quad in its orbital plane: the vertex stage
// projects the local quad corner through the per-instance MVP and forwards
// the LOCAL xy coordinate; the fragment stage evaluates the analytic circle
// SDF against that coordinate (the unit circle lives at local radius 1) plus
// an angular brightness lobe. 'VSOut' is the contract between those stages.
//
// ## Why the struct lives here
//
// One authoritative inter-stage declaration makes vertex/fragment @location
// drift structurally impossible — the same reasoning 'planet/io.wesl' states.
// The colour varying MUST stay '@interpolate(flat)' on both sides (one solid
// tint per ring; nothing meaningful to interpolate across the quad);
// declaring it once here means the flat qualifier cannot silently diverge
// between the stages.

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  // Local quad coordinate in [-1.1, 1.1]^2 — the fragment's SDF domain. The
  // unit circle (the orbit) sits at length(local) == 1; the 0.1 margin gives
  // the anti-aliased falloff room outside it.
  @location(0) local: vec2<f32>,
  // Per-instance ring tint forwarded flat — one solid colour per orbit.
  @location(1) @interpolate(flat) color: vec3<f32>,
};
