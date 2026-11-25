// atmosphere/aerialPerspective/fragmentDualSource.wesl — 'fragment.wesl''s MULTIPLY +
// ADD pair as ONE draw on devices with 'dual-source-blending': the same
// 'aerialSample', evaluated once, blended 'dst = emission + dst * transmit'
// ('data/rendering/dualSourceBlend.ts'). Drawn with 'fragment.wesl''s own 'vs'.
//
// The 'enable' sits AFTER the imports: placed before them the linker leaves the
// imports unlinked. It still lands ahead of every declaration in the linked output.
import package::atmosphere::aerialPerspective::fragment::aerialSample;
import package::lib::fullscreenTri::FullscreenOut;

enable dual_source_blending;

struct DualSourceOut {
  @location(0) @blend_src(0) emission: vec4<f32>,
  @location(0) @blend_src(1) transmit: vec4<f32>,
};

@fragment
fn fsAerialDualSource(in: FullscreenOut) -> DualSourceOut {
  let aerial = aerialSample(in);
  if (!aerial.hit) {
    discard;
  }
  var out: DualSourceOut;
  out.emission = aerial.emission;
  out.transmit = aerial.transmit;
  return out;
}
