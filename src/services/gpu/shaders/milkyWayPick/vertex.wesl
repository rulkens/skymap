// milkyWayPick/vertex.wesl — screen-aligned billboard at the galactic
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
// can never disagree with the rendered frame: the pick pass replays the
// last visual frame's uniform bytes at @group(0), so the camera facts
// this projection reads (camPosWorld, pxPerRad) are byte-identical to
// the ones that sized the glow the user sees.  The CPU keeps only the
// visibility gate ('milkyWayPickVisible').  The 'u.pointSizePx' floor is
// the pick-widened value — the CPU overrides that slot to
// (sizePx + PICK_PADDING_PX) before the pass (pickRenderer.ts) — so the
// MW floor matches the padded floor every pick point gets.
//
// The packed pick identity is composed in the vertex stage (mirroring
// points/vertex.wesl's 'packSelection(source.sourceCode, ii)') and
// forwarded flat-interpolated to the fragment, which writes it verbatim.
// The MW carries no per-record localIdx, so it is always 0; the vertex
// adds PICK_SENTINEL_OFFSET here so the cleared-to-zero pick texture
// stays distinguishable from a real (code, 0) hit.

import package::milkyWayPick::io::Uniforms;
import package::milkyWayPick::io::MilkyWayPickUniforms;
import package::milkyWayPick::io::VsOut;
import package::lib::camera::worldToClip;
import package::lib::billboard::quadCorner;
import package::lib::billboard::expandBillboardScreen;
import package::lib::selectionEncoding::packSelection;
import package::lib::selectionEncoding::PICK_SENTINEL_OFFSET;

// @group(0) points-pick uniform mirror — reused from the caller's bound
// group (the galaxy pick draws set it).  Reads extend through 'pxPerRad'
// at byte 108 of the points pick buffer — see io.wesl for the mirrored
// prefix layout.
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
  // Only X/Y move — depth + w pass through so the shared depth test
  // resolves a foreground galaxy over the MW billboard.
  out.pos = vec4<f32>(centerClip.xy + offset, centerClip.zw);
  out.uv = corner;
  // MW localIdx is always 0; add PICK_SENTINEL_OFFSET here — the
  // fragment writes this value verbatim.
  out.packedPick = packSelection(mw.sourceCode, 0u) + PICK_SENTINEL_OFFSET;
  return out;
}
