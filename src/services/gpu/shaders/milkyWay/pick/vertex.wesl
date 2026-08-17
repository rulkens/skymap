// milkyWay/pick/vertex.wesl — screen-aligned billboard at the galactic
// centre for the Milky-Way pick path.
//
// One instance, six vertices.  The billboard is SCREEN-aligned and sized
// IN-SHADER from the shared camera uniforms: the world radius
// 'mw.radiusMpc' (the rendered star/dust cloud's physical radius, not
// the larger selection ring) is projected to apparent pixels with the
// SAME derivation points/vertex.wesl applies per galaxy —
//
//   apparentPxRadius = (radiusMpc / distance(camPosWorld, centre)) * pxPerRad
//   halfExtentPx     = max(u.pointSizePx, apparentPxRadius)
//
// Computing the size here rather than on the CPU means the hit target
// can never disagree with the rendered frame: the @group(0) bytes are
// built at pick time from the slab view (pickUniformBytesOf), already
// pick-shaped, and the camera facts this projection reads (camPosWorld,
// pxPerRad) are the same ones that sized the glow the user sees.  The CPU
// keeps only the visibility gate — the pick program's 'enabled' filter,
// i.e. 'milkyWayLayer.enabled' against the pick-time camera.  The
// 'u.pointSizePx' floor is already the pick-widened value — the pick pack
// bakes (sizePx + PICK_PADDING_PX) into that slot (pickUniformBytesOf) — so
// the MW floor matches the padded floor every pick point gets.
//
// The packed pick identity is composed in the vertex stage (mirroring
// points/vertex.wesl's 'packSelection(source.sourceCode, ii)') and
// forwarded flat-interpolated to the fragment, which writes it verbatim.
// The MW carries no per-record localIdx, so it is always 0; the vertex
// adds PICK_SENTINEL_OFFSET here so the cleared-to-zero pick texture
// stays distinguishable from a real (code, 0) hit.

import package::milkyWay::pick::io::Uniforms;
import package::milkyWay::pick::io::MilkyWayPickUniforms;
import package::milkyWay::pick::io::VsOut;
import package::lib::camera::worldToClip;
import package::lib::billboard::quadCorner;
import package::lib::billboard::expandBillboardScreen;
import package::lib::selectionEncoding::packSelection;
import package::lib::selectionEncoding::PICK_SENTINEL_OFFSET;
import package::lib::pickDepthBands::PICK_BAND_BACKDROP_EPS;

// @group(0) points-pick uniform mirror — bound by pickMilkyWay itself
// from its own buffer (the MW is the sole pickable in the NEAR0 pick
// pass, so there is no prior draw to inherit a camera from). Reads extend
// through 'pxPerRad' at byte 108 of the points pick image — see io.wesl
// for the mirrored prefix layout.
@group(0) @binding(0) var<uniform> u: Uniforms;

// @group(2) MilkyWayPickUniforms — world centre + source code + disc
// world radius, all written once at construction (the uniform is fully
// static; the apparent size is derived above from @group(0)).
@group(2) @binding(0) var<uniform> mw: MilkyWayPickUniforms;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VsOut {
  let centerClip = worldToClip(u.cam, mw.centerWorld);
  let corner = quadCorner(vi);

  // Apparent on-screen radius of the disc — same formula as the points
  // shader's apparent-size billboard.  Guard the distance against 0 so
  // a camera parked exactly on the centre doesn't divide by zero (same
  // 0.001 floor points/vertex.wesl uses).
  let toCenter = mw.centerWorld - u.camPosWorld;
  let safeDist = max(length(toCenter), 0.001);
  let apparentPxRadius = (mw.radiusMpc / safeDist) * u.pxPerRad;
  let halfExtentPx = max(u.pointSizePx, apparentPxRadius);

  let offset = expandBillboardScreen(u.cam, centerClip, halfExtentPx, corner);

  var out: VsOut;
  // The impostor is the ULTIMATE pick fallback (header 'lib/pickDepthBands'):
  // its true depth would let it beat a forced-far survey star, but by IMPORTANCE
  // the galaxy backdrop must sit behind everything. So instead of passing depth
  // through we FORCE the lowest band, 'z = w * PICK_BAND_BACKDROP_EPS'.
  // That band has the SMALLEST eps of the three, hence the SMALLEST z/w, so it
  // LOSES the 'greater' test to every star band — an overlapping resolvable Gaia
  // dot now wins the click over the galaxy. It still stays just above the 0.0
  // clear (positive z/w) so the billboard survives the clip test. Only X/Y take
  // the billboard offset; w passes through so the perspective divide lands the
  // band correctly.
  let bandZ = centerClip.w * PICK_BAND_BACKDROP_EPS;
  out.pos = vec4<f32>(centerClip.xy + offset, bandZ, centerClip.w);
  out.uv = corner;
  // MW localIdx is always 0; add PICK_SENTINEL_OFFSET here — the
  // fragment writes this value verbatim.
  out.packedPick = packSelection(mw.sourceCode, 0u) + PICK_SENTINEL_OFFSET;
  return out;
}
