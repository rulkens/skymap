// milkyWay/pick/vertex.wesl — screen-aligned billboard at the galactic centre
// for the Milky-Way pick path. One instance, six vertices.
//
// Sized in-shader from the shared camera uniforms with the SAME derivation as
// points/vertexBody.wesl: halfExtentPx = max(mw.minSizePx, radiusMpc / dist *
// pxPerRad), using the rendered cloud's radius (not the larger selection ring).
// Computing it here keeps the hit target agreeing with the rendered frame; the
// CPU keeps only the visibility gate. 'mw.minSizePx' is a static scene constant,
// so the hit target does not follow the galaxy size slider.
//
// The packed pick identity is composed here and forwarded flat to the fragment.
// The MW has no localIdx (always 0), so PICK_SENTINEL_OFFSET is added to keep
// it distinct from the cleared-to-zero pick texture.

import package::milkyWay::pick::io::Uniforms;
import package::milkyWay::pick::io::MilkyWayPickUniforms;
import package::milkyWay::pick::io::VsOut;
import package::lib::camera::worldToClip;
import package::lib::billboard::quadCorner;
import package::lib::billboard::expandBillboardScreen;
import package::lib::selectionEncoding::packSelection;
import package::lib::selectionEncoding::PICK_SENTINEL_OFFSET;
import package::lib::pickDepthBands::PICK_BAND_BACKDROP_EPS;

// 96-byte camera image packed by pickMilkyWay; byte layout in io.wesl.
@group(0) @binding(0) var<uniform> u: Uniforms;

// Fully static, written once at construction.
@group(2) @binding(0) var<uniform> mw: MilkyWayPickUniforms;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VsOut {
  let centerClip = worldToClip(u.cam, mw.centerWorld);
  let corner = quadCorner(vi);

  // 0.001 distance floor, as in points/vertexBody.wesl.
  let toCenter = mw.centerWorld - u.camPosWorld;
  let safeDist = max(length(toCenter), 0.001);
  let apparentPxRadius = (mw.radiusMpc / safeDist) * u.pxPerRad;
  let halfExtentPx = max(mw.minSizePx, apparentPxRadius);

  let offset = expandBillboardScreen(u.cam, centerClip, halfExtentPx, corner);

  var out: VsOut;
  // The impostor is the ultimate pick fallback ('lib/pickDepthBands'): true
  // depth could beat a forced-far survey star, so force the lowest band,
  // 'z = w * PICK_BAND_BACKDROP_EPS'. Smallest eps means smallest z/w, so it
  // loses the 'greater' test to every star band, yet stays above the 0.0 clear
  // so it survives clipping.
  let bandZ = centerClip.w * PICK_BAND_BACKDROP_EPS;
  out.pos = vec4<f32>(centerClip.xy + offset, bandZ, centerClip.w);
  out.uv = corner;
  out.packedPick = packSelection(mw.sourceCode, 0u) + PICK_SENTINEL_OFFSET;
  return out;
}
