// milkyWayField/dustPresent.wesl — the "JWST" view mode: presents
// dustMap.wesl's screen-space column map directly, through a hot MIRI-ish
// palette, instead of using it to attenuate emission. Replaces the emission
// splat draw when render.dustView is on (createGalaxyEngine.ts), writing into
// dustViewTex — its OWN target, divisor-matched to dustMapTex rather than to
// fieldTex (see io.wesl's DUST MAP doc), so the scene pass's aggregate-
// upsample composite picks whichever of the two targets ran this frame.

import package::lib::fullscreenTri::fullscreenVertex;
import package::lib::fullscreenTri::FullscreenOut;

@group(0) @binding(0) var dustMapTex: texture_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> FullscreenOut {
  return fullscreenVertex(vi);
}

@fragment
fn fs(input: FullscreenOut) -> @location(0) vec4<f32> {
  // dustMapTex is divisor-matched to THIS pass's target (dustViewTex) by
  // construction — createGalaxyEngine.ts's buildDustViewTarget sizes it to
  // reducedSize(render.dustDivisor), the same call buildDustMapTarget uses
  // for dustMapTex itself, and rebuilds it whenever that divisor moves — so
  // framebuffer coords ARE map texels, a direct 1:1 load. A UV rescale here
  // previously papered over a resolution MISMATCH (dustMapTex at full canvas
  // res, this target at a coarser divisor); that decimated any lane thinner
  // than the divisor into beads, which is why it's gone.
  let coord = vec2<i32>(input.pos.xy);
  // dustMapTex now carries four depth-sliced optical depths (io.wesl's
  // dustSlices doc), not one column — this presentation has no notion of
  // depth, so it sums them back into the total tau a single-column map
  // would have held.
  let texel = textureLoad(dustMapTex, coord, 0);
  let tau = texel.x + texel.y + texel.z + texel.w;

  // Presentation palette, NOT physics: intensity saturates smoothly with
  // column depth, then ramps black -> deep red -> orange -> white. Tuned by
  // eye for a JWST/MIRI dust-map look; none of these four colours or the
  // 1.5 rate is a measured quantity.
  let i = 1.0 - exp(-tau * 1.5);
  let black = vec3<f32>(0.0, 0.0, 0.0);
  let deepRed = vec3<f32>(0.55, 0.08, 0.02);
  let orange = vec3<f32>(1.0, 0.45, 0.1);
  let white = vec3<f32>(1.0, 1.0, 1.0);
  let warm = mix(mix(black, deepRed, smoothstep(0.0, 0.5, i)), orange, smoothstep(0.5, 0.8, i));
  let color = mix(warm, white, smoothstep(0.8, 1.0, i));

  // Alpha 0, matching splat.wesl's fs: this target's alpha channel feeds
  // nothing downstream (the additive upsample folds RGB into HDR and the
  // compositor forces alpha 1.0).
  return vec4<f32>(color, 0.0);
}
