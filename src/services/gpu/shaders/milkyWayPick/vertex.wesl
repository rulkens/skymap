// milkyWayPick/vertex.wesl — screen-size-clamped billboard at the
// galactic centre for the Milky-Way pick path.
//
// One instance, six vertices.  The billboard is SCREEN-aligned and
// SCREEN-SIZED (a fixed pixel half-extent), not world-sized: the Milky
// Way is a hit target, not a visual, so it must stay clickable at any
// zoom — the same 'never shrink below a pixel floor' guarantee a galaxy
// point holds via 'u.pointSizePx' (see points/vertex.wesl's
// 'max(u.pointSizePx, apparentPxRadius)').  A fixed floor is enough here
// because there is no visible sprite to scale.
//
// The packed pick identity is composed in the vertex stage (mirroring
// points/vertex.wesl's 'packSelection(source.sourceCode, ii)') and
// forwarded flat-interpolated to the fragment.  The MW carries no
// per-record localIdx, so it is always 0; the fragment adds
// PICK_SENTINEL_OFFSET before writing so the cleared-to-zero pick
// texture stays distinguishable from a real (code, 0) hit.

import package::milkyWayPick::io::Uniforms;
import package::milkyWayPick::io::MilkyWayPickUniforms;
import package::milkyWayPick::io::VsOut;
import package::lib::camera::worldToClip;
import package::lib::billboard::quadCorner;
import package::lib::billboard::expandBillboardScreen;
import package::lib::selectionEncoding::packSelection;
import package::lib::selectionEncoding::PICK_SENTINEL_OFFSET;

// @group(0) CameraUniforms — reused from the caller's bound group (the
// galaxy pick draws set it).  Reads stay within the points pick buffer's
// 80-byte prefix.
@group(0) @binding(0) var<uniform> u: Uniforms;

// @group(2) MilkyWayPickUniforms — world centre + source code, written
// once at construction.
@group(2) @binding(0) var<uniform> mw: MilkyWayPickUniforms;

// Screen-pixel half-extent of the pick billboard.  Chosen comfortably
// large so the galactic centre is an easy click target; this is a hit
// area, not a visual, so an over-generous radius costs nothing.  The
// matching value lives only here — there is no CPU-side counterpart to
// drift against.
const MILKY_WAY_PICK_SIZE_PX: f32 = 16.0;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VsOut {
  let centerClip = worldToClip(u.cam, mw.centerWorld);
  let corner = quadCorner(vi);
  let offset = expandBillboardScreen(u.cam, centerClip, MILKY_WAY_PICK_SIZE_PX, corner);

  var out: VsOut;
  // Only X/Y move — depth + w pass through so the shared depth test
  // resolves a foreground galaxy over the MW billboard.
  out.pos = vec4<f32>(centerClip.xy + offset, centerClip.zw);
  out.uv = corner;
  // MW localIdx is always 0; the fragment adds PICK_SENTINEL_OFFSET.
  out.packedPick = packSelection(mw.sourceCode, 0u) + PICK_SENTINEL_OFFSET;
  return out;
}
