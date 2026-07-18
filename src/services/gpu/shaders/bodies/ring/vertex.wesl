// ring/vertex.wesl -- vertex stage for the translucent planetary ring.
//
// Projects each annulus point (a unit-outer-radius disc in the local z = 0
// plane) through the combined MVP from 'RingUniforms'. The MVP is composed
// CPU-side by 'composeBodyMvp' using the HOST body's orientation + position and
// the ring's OUTER radius as the scale, so the disc lands in the body's exact
// equatorial plane at the right world size -- the ring rides the planet's frame
// by construction, with no ring-specific transform.
//
// The fragment needs the annulus point in the body's LOCAL frame (for the strip
// radius and the sun-shadow ray), so the raw local position is forwarded
// unchanged. There is no normal attribute: the ring plane normal is the constant
// local +z, reconstructed in the fragment.
//
// ## Bindings
//
// '@group(0) @binding(0)' holds 'RingUniforms' (96 bytes), visible in BOTH
// stages: the vertex reads 'u.mvp', the fragment reads 'u.sunDirLocal' and the
// two ring-shape scalars. The sampler + strip texture live at bindings 1..2 for
// the fragment stage (declared in the fragment module).
//
// As with the sphere bodies, the '@group/@binding' declaration is module-local
// (WESL has no global state), so 'u' is declared here and 'u.mvp' is passed into
// the imported 'clip_from_local' helper -- the 'pass cam, don't capture' idiom.
//
// ## Attribute layout
//
//   @location(0) position: vec3<f32>  -- annulus local-space vertex (z = 0),
//                                        tightly-packed f32x3 VBO, stride 12.

import package::bodies::ring::io::VSOut;
import package::lib::sphere::RingUniforms;
import package::lib::sphere::clip_from_local;

@group(0) @binding(0) var<uniform> u: RingUniforms;

@vertex
fn vs(@location(0) position: vec3<f32>) -> VSOut {
  var out: VSOut;
  out.clip = clip_from_local(u.mvp, position);
  // Forward the annulus point in the body's local frame; the fragment derives
  // the strip radius and the sun-shadow ray from it.
  out.localPos = position;
  return out;
}
