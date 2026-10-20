// points/pooledColorFragment.wesl — the pooled (octree) points pipeline's visual
// fragment: the per-source fade sits in the source's @group(2) block at
// binding 3, since @group(1) holds the octree cut. The stage itself is
// 'galaxyPointColor' (points/colorBody.wesl), shared with the flat pipeline.

import package::galaxyCatalog::points::io::VSOut;
import package::galaxyCatalog::points::colorBody::galaxyPointColor;
import package::lib::fadeUniforms::FadeUniforms;

@group(2) @binding(3) var<uniform> fade: FadeUniforms;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  return galaxyPointColor(in, fade.opacity);
}
