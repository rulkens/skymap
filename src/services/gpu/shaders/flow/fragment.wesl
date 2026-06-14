// flow/fragment.wesl — composites the ribbon's per-vertex colour + alpha.
//
// Pure additive output: the vertex stage already folded 'intensity' into 'col',
// so the fragment just premultiplies by 'alpha' for the additive blend. It reads
// nothing but its interpolated 'VsOut' inputs — no bindings.

import package::flow::io::VsOut;

@fragment
fn fsTrail(i: VsOut) -> @location(0) vec4<f32> {
  return vec4<f32>(i.col * i.alpha, i.alpha);
}
