// markerLines/fragmentOcclude.wesl — the scene-attenuated variant of the
// soft-edged thick-line fragment stage.
//
// Leader lines draw AFTER the solar-system bodies, in a depthless
// premultiplied-OVER composite. A connector anchored behind a planet would
// otherwise paint over the body in front of it, so the shaded result is scaled
// by 'sceneTransmittance' (lib/sceneDepth.wesl) — 0 under an opaque body, 1
// over empty sky. This is the leader-line mirror of labels/fragmentOcclude.wesl;
// the shading itself is the plain 'fs' entry's ('shadeLine', premultiplied, so
// one scalar multiply dims colour and coverage together). 'occludeWeight' mixes
// that rule in per instance for the same reason the captions carry one: a
// connector whose subject is in FRONT of a body must not fade into its disc.
//
// In the fragment stage the VsOut builtin-position field 'input.pos' holds the
// framebuffer position: '.xy' is window pixels.

import package::markerLines::io::VsOut;
import package::markerLines::fragment::shadeLine;
import package::lib::sceneDepth::sceneTransmittance;

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  return shadeLine(input) * mix(1.0, sceneTransmittance(input.pos.xy), input.occludeWeight);
}
