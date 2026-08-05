// milkyWay/field/dustPresent.wesl — the "JWST" view mode: presents
// dustMap.wesl's screen-space column map through a hot MIRI-ish palette,
// crossfaded with the emission splat draw by render.dustViewIntensity
// (createGalaxyEngine.ts). Writes into dustViewTex, divisor-matched to
// dustMapTex, not fieldTex (io.wesl's DUST MAP doc).
//
// S4 (docs/research/m74-jwst/07-sprite-seeding.md): the presented column is
// further modulated by dustDetailMultiplier, a per-fragment high-pass read
// of the SF map at the ray's disc intersection. The term itself now lives in
// dustDetail.wesl, shared with splat.wesl's dust attenuation — see that
// module's header for why the two views must agree.

import package::lib::fullscreenTri::fullscreenVertex;
import package::lib::fullscreenTri::FullscreenOut;
import package::milkyWay::field::io::u;
import package::milkyWay::field::io::dustMapTex;
import package::milkyWay::field::dustDetail::dustDetailMultiplier;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> FullscreenOut {
  return fullscreenVertex(vi);
}

@fragment
fn fs(input: FullscreenOut) -> @location(0) vec4<f32> {
  // dustMapTex is divisor-matched to THIS pass's target (dustViewTex) by
  // construction — createGalaxyRenderTargets.ts's rebuildDust sizes BOTH to
  // reducedSize(render.dustDivisor) in one call, and reruns whenever that
  // divisor moves, so neither can be left behind at the other's extent.
  // Framebuffer coords therefore ARE map texels, a direct 1:1 load. A UV rescale here
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

  // dustDetailMultiplier needs its own ray, reconstructed here from the
  // fullscreen-triangle uv — mirrors splat.wesl's own NDC-based
  // reconstruction, just fed from a different varying since this pass has
  // no per-instance NDC to interpolate.
  let tanHalfFov = u.params.x;
  let aspect = u.params.y;
  let shift = u.params.z;
  let ndcX = input.uv.x * 2.0 - 1.0;
  let ndcY = 1.0 - input.uv.y * 2.0;
  let d = normalize(
    u.camRight.xyz * ((ndcX + shift) * tanHalfFov * aspect)
      + u.camUp.xyz * (ndcY * tanHalfFov)
      + u.camFwd.xyz,
  );
  let o = u.eye.xyz;
  // S4: modulate the splat-accumulated column by the SF map's own high-pass
  // ratio at this fragment's disc intersection, BEFORE the palette — the
  // splats keep the low/mid frequencies, the map contributes only what the
  // blur removed.
  let tau2 = tau * dustDetailMultiplier(o, d);

  // Presentation palette, NOT physics: intensity saturates smoothly with
  // column depth, then ramps black -> deep red -> orange -> white. Tuned by
  // eye for a JWST/MIRI dust-map look; none of these four colours or the
  // 1.5 rate is a measured quantity.
  let i = 1.0 - exp(-tau2 * 1.5);
  let black = vec3<f32>(0.0, 0.0, 0.0);
  let deepRed = vec3<f32>(0.55, 0.08, 0.02);
  let orange = vec3<f32>(1.0, 0.45, 0.1);
  let white = vec3<f32>(1.0, 1.0, 1.0);
  let warm = mix(mix(black, deepRed, smoothstep(0.0, 0.5, i)), orange, smoothstep(0.5, 0.8, i));
  let color = mix(warm, white, smoothstep(0.8, 1.0, i));

  // Alpha 0, matching splat.wesl's fs: this target's alpha channel feeds
  // nothing downstream (the additive upsample folds RGB into HDR and the
  // compositor forces alpha 1.0).
  //
  // debugView.x is this view's own crossfade weight (io.wesl's debugView
  // doc) — 0 with the slider off, which keeps this pass's contribution to
  // the additive composite at zero even on a frame where it still runs.
  return vec4<f32>(color * u.debugView.x, 0.0);
}
