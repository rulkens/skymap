// star/fragment.wesl — flat emissive fragment for the resolved star.
//
// The star's surface is a light source, not a lit surface: every
// fragment emits the same spectral colour, scaled by a fixed emissive
// multiplier. No limb darkening, no granulation — those are plan-03
// close-approach polish; at the descent distances where the Sun resolves
// from a point into a disc, a uniformly bright ball reads correctly.
//
// ## Emissive multiplier
//
// 'EMISSIVE' scales the (0..1-ranged, linear-RGB) spectral tint into
// HDR territory. The foreground target is rgba16float and the tone-map
// pass compresses highlights, so values above 1.0 are not clipped —
// they read as 'brighter than any reflective surface', which is exactly
// what a star next to a lambert-lit planet should do. 4.0 is an
// aesthetic constant (comfortably above the ~1.0 ceiling of lit albedo,
// well inside f16 range), not photometry; real luminance-derived
// brightness is plan-03 LOD work.
//
// ## Bindings / blend target
//
// Same 'TintedSphereUniforms' binding as 'star/vertex.wesl' (the vertex
// stage reads 'mvp', this stage reads 'tint'); the shared struct import
// keeps the two modules' layouts locked. Output is straight alpha=1 —
// the star draws in the OPAQUE foreground pass (depth-tested, no
// blend), and the foreground composite handles layer blending.

import package::lib::sphere::TintedSphereUniforms;

@group(0) @binding(0) var<uniform> u: TintedSphereUniforms;

const EMISSIVE: f32 = 4.0;

@fragment
fn fs() -> @location(0) vec4<f32> {
  return vec4<f32>(u.tint * EMISSIVE, 1.0);
}
