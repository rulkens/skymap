// texturedMesh/fragment.wesl — the MVS mesh, unlit: the photogrammetric texture IS the
// evidence the layer exists to show, and a lighting model would add a second
// opinion about a surface the reconstruction already decided.

import package::texturedMesh::io::MaskPolygon;
import package::texturedMesh::io::VsOut;

@group(1) @binding(0) var atlas: texture_2d<f32>;
@group(1) @binding(1) var samp: sampler;
@group(1) @binding(2) var<storage, read> maskPolygon: MaskPolygon;

// Even-odd crossing, half-open in y — the exact rule of insideRing.ts, so the preview
// shows what crop-mesh cuts. Reads the module-scope binding: WGSL cannot pass a
// runtime-sized array to a function.
fn insideMask(p: vec2f) -> bool {
  let n = maskPolygon.count;
  if (n < 3u) {
    return true;
  }
  var inside = false;
  var j = n - 1u;
  for (var i = 0u; i < n; i++) {
    let a = maskPolygon.cornersM[i];
    let b = maskPolygon.cornersM[j];
    if ((a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
    j = i;
  }
  return inside;
}

@fragment
fn fs(i: VsOut) -> @location(0) vec4<f32> {
  // Sampled before the discard, so the implicit-derivative call stays in uniform control flow.
  let texel = textureSample(atlas, samp, i.uv);
  if (!insideMask(i.localXY)) {
    discard;
  }
  return vec4<f32>(texel.rgb, 1.0);
}
