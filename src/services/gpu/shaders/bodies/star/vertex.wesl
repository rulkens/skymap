// star/vertex.wesl — vertex stage for the resolved (sphere-filling) star.
//
// Identical projection wiring to 'earth/vertex.wesl' and
// 'planet/vertex.wesl': multiply each unit-sphere local position by
// the combined MVP. The star is flat emissive — the fragment stage reads
// only the uniform colour, so unlike the planet no local position
// is forwarded and unlike the Earth no uv is forwarded. The vertex
// output is the bare clip position.
//
// ## Bindings
//
// '@group(0) @binding(0)' holds 'TintedSphereUniforms' (80 bytes:
// mat4x4<f32> mvp + vec3<f32> tint, padded to 80 — see lib/sphere.wesl
// for the authoritative byte layout). The binding is declared in BOTH
// this module and 'star/fragment.wesl' (the vertex stage reads 'mvp',
// the fragment stage reads 'tint'); importing the one authoritative
// struct from lib/sphere makes layout drift structurally impossible,
// the same idiom 'points/io.wesl' uses.
//
// ## Attribute layout
//
//   @location(0) position: vec3<f32>  — unit-sphere local-space vertex
//                                       (tightly-packed f32x3 VBO,
//                                       stride 12). The mesh is the
//                                       z-up equatorial J2000 frame
//                                       'uvSphereMesh'; orientation is
//                                       irrelevant for a flat emissive
//                                       ball but keeps the mesh shared.

import package::lib::sphere::TintedSphereUniforms;
import package::lib::sphere::clip_from_local;

@group(0) @binding(0) var<uniform> u: TintedSphereUniforms;

@vertex
fn vs(@location(0) position: vec3<f32>) -> @builtin(position) vec4<f32> {
  return clip_from_local(u.mvp, position);
}
