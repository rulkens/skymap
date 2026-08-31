// labels/fragmentOcclude.wesl — the scene-attenuated variant of the MSDF label
// fragment stage.
//
// Labels draw AFTER the solar-system bodies, in a depthless premultiplied-OVER
// composite. A label anchored behind a planet would otherwise paint over the
// body in front of it, so the shaded result is scaled by 'sceneTransmittance'
// (lib/sceneDepth.wesl) — 0 under an opaque body, 1 over empty sky. The shading
// itself is the plain 'fs' entry's: both reuse 'shadeMsdf' (lib/msdf.wesl) so
// glyph colour has one source of truth.
//
// Because 'shadeMsdf' returns PREMULTIPLIED rgba, one scalar multiply dims the
// colour and drops the coverage together — no separate alpha handling.
//
// In the fragment stage the VsOut builtin-position field 'input.pos' holds the
// framebuffer position: '.xy' is window pixels.

import package::labels::io::VsOut;
import package::lib::msdf::shadeMsdf;
import package::lib::sceneDepth::sceneTransmittance;

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  let shaded = shadeMsdf(input.uv, input.fontIndex, input.color, input.outlineColor, input.outlineSdf);
  return shaded * sceneTransmittance(input.pos.xy);
}
