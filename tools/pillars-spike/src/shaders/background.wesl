// background.wesl — fullscreen deep-space backdrop.
//
// Paints bgColor(rayDir) for every pixel, reconstructing the ray from the
// camera basis in SceneUniforms (see lib/scene.wesl for why the basis, not
// an inverse matrix). The nebula pass later REPLACES the pixels inside the
// volume's screen footprint with its own evaluation of the same function
// attenuated by the march's transmittance — the two must agree exactly
// where the volume is empty, which sharing lib/starfield.wesl guarantees.

import package::lib::fullscreenTri::FullscreenOut;
import package::lib::fullscreenTri::fullscreenVertex;
import package::lib::scene::SceneUniforms;
import package::lib::starfield::bgColor;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> FullscreenOut { return fullscreenVertex(vi); }

@group(0) @binding(0) var<uniform> scene: SceneUniforms;

@fragment
fn fs(i: FullscreenOut) -> @location(0) vec4<f32> {
  // uv → NDC (+y up), then through the camera basis to a world ray.
  let ndc = vec2<f32>(i.uv.x * 2.0 - 1.0, 1.0 - i.uv.y * 2.0);
  let dir = normalize(
    scene.camFwd
      + scene.camRight * (ndc.x * scene.tanHalfFov * scene.aspect)
      + scene.camUp * (ndc.y * scene.tanHalfFov),
  );
  return vec4<f32>(bgColor(dir), 1.0);
}
