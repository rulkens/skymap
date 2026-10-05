// contactShadow/vertex.wesl -- the unit cube [-1,1]^3 from vertex_index alone,
// 36 vertices, every face wound counter-clockwise seen from OUTSIDE. The
// pipeline culls front faces, so the far walls raster and the box still covers
// its footprint with the eye inside it.

import package::bodies::contactShadow::io::ContactShadowUniforms;

@group(0) @binding(0) var<uniform> u: ContactShadowUniforms;

// Corner i sits at (bit0, bit1, bit2) of i, mapped 0 -> -1 and 1 -> +1.
const CUBE_CORNERS: array<u32, 36> = array<u32, 36>(
  0u, 4u, 6u, 0u, 6u, 2u, // -x
  1u, 3u, 7u, 1u, 7u, 5u, // +x
  0u, 1u, 5u, 0u, 5u, 4u, // -y
  2u, 6u, 7u, 2u, 7u, 3u, // +y
  0u, 2u, 3u, 0u, 3u, 1u, // -z
  4u, 5u, 7u, 4u, 7u, 6u, // +z
);

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4<f32> {
  // A function-scope copy: naga rejects a runtime index into a module const.
  var corners = CUBE_CORNERS;
  let c = corners[vertexIndex];
  let corner = vec3<f32>(f32(c & 1u), f32((c >> 1u) & 1u), f32((c >> 2u) & 1u)) * 2.0 - 1.0;
  return u.boxToClip * vec4<f32>(corner, 1.0);
}
