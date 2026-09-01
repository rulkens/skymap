// selectionRing/fragmentOcclude.wesl — the scene-attenuated variant of the
// selection-ring fragment stage.
//
// The ring draws AFTER the solar-system bodies, in a depthless
// premultiplied-OVER composite. A ring anchored behind a planet would otherwise
// paint over the body in front of it, so the shaded result is scaled by
// 'sceneTransmittance' (lib/sceneDepth.wesl) — 0 under an opaque body, 1 over
// empty sky. The mask itself is the plain 'fs' entry's ('shadeRing',
// premultiplied, so one scalar multiply dims colour and coverage together).
//
// In the fragment stage the VsOut builtin-position field 'input.pos' holds the
// framebuffer position: '.xy' is window pixels.

import package::selectionRing::io::VsOut;
import package::selectionRing::fragment::shadeRing;
import package::lib::sceneDepth::sceneTransmittance;

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  return shadeRing(input) * sceneTransmittance(input.pos.xy);
}
