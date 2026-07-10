// orbitRing/vertex.wesl — vertex stage for the instanced SDF orbit ring.
//
// Projection wiring parallels 'planet/vertex.wesl': multiply each quad corner
// by the combined per-instance MVP and pass the local xy through as the
// fragment's SDF domain. The MVP's model half is a ROTATED basis (the orbital
// plane's in-plane axes scaled by the orbital radius — see 'composeOrbitMvp'),
// so the flat local-z=0 quad lands in the world-space orbital plane with the
// unit circle mapped onto the actual orbit.
//
// ## Why per-instance attributes, not a per-draw uniform
//
// One renderer draws every orbit ring in a SINGLE instanced 'drawIndexed'.
// The per-ring MVP + colour arrive as instance-step vertex attributes (one
// record per '@builtin(instance_index)'), not a uniform mutated between
// draws. That is the house idiom ('planetRenderer'): one 'writeBuffer' + one
// draw beats N per-ring binds, and it dodges the writeBuffer-vs-submit race
// by construction, since every instance reads its own baked record. WESL has
// no mat4 vertex-attribute type, so the MVP streams as four vec4<f32> columns
// and is reassembled here.
//
// ## Attribute layout (matches the TS pipeline descriptor byte-for-byte)
//
//   @location(0) position: vec3<f32>  — quad corner, xy in [-1.1, 1.1], z=0
//                                       (per-vertex, tight f32x3 VBO, stride 12)
//   @location(1) mvp0: vec4<f32>      — MVP column 0  } per-instance record,
//   @location(2) mvp1: vec4<f32>      — MVP column 1  } stride 80: four MVP
//   @location(3) mvp2: vec4<f32>      — MVP column 2  } columns (64 B) + colour
//   @location(4) mvp3: vec4<f32>      — MVP column 3  } (rgb + 1 pad float, 16 B)
//   @location(5) color: vec4<f32>     — ring tint rgb in .xyz, .w unused

import package::orbitRing::io::VSOut;

@vertex
fn vs(
  @location(0) position: vec3<f32>,
  @location(1) mvp0: vec4<f32>,
  @location(2) mvp1: vec4<f32>,
  @location(3) mvp2: vec4<f32>,
  @location(4) mvp3: vec4<f32>,
  @location(5) color: vec4<f32>,
) -> VSOut {
  var out: VSOut;
  // Column-major reassembly: mat4x4<f32>(c0, c1, c2, c3) takes each vec4 as a
  // COLUMN, matching the column-major MVP 'composeOrbitMvp' narrows to f32.
  let mvp = mat4x4<f32>(mvp0, mvp1, mvp2, mvp3);
  out.clip = mvp * vec4<f32>(position, 1.0);
  out.local = position.xy;
  out.color = color.xyz;
  return out;
}
