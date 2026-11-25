// atmosphere/shell/fragmentDualSource.wesl — 'fragment.wesl''s MULTIPLY + ADD pair
// as ONE draw on devices with 'dual-source-blending': the same 'sampleShell',
// evaluated once, blended 'dst = emission + dst * transmit'
// ('data/rendering/dualSourceBlend.ts'). The outputs are the pair's own, alpha included.
//
// The 'enable' sits AFTER the imports: placed before them the linker leaves the
// imports unlinked. It still lands ahead of every declaration in the linked output.
import package::atmosphere::shell::fragment::FsIn;
import package::atmosphere::shell::fragment::sampleShell;

enable dual_source_blending;

struct DualSourceOut {
  @location(0) @blend_src(0) emission: vec4<f32>,
  @location(0) @blend_src(1) transmit: vec4<f32>,
};

@fragment
fn fsDualSource(in: FsIn) -> DualSourceOut {
  let shell = sampleShell(in);
  if (!shell.hit) {
    discard;
  }
  var out: DualSourceOut;
  out.emission = vec4<f32>(shell.emission, shell.coverage);
  out.transmit = vec4<f32>(shell.transmit, 1.0 - shell.coverage);
  return out;
}
