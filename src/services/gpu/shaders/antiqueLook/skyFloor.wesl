// antiqueLook/skyFloor.wesl — the field floor: the 30th percentile of the 1/16
// glow's luma over its sky texels, one f32 per frame, read by the plate in the
// same submit (a CPU readback would land a frame late). It scales the galaxy
// gate and outline level with the field, so a dense survey field is not engraved
// as one nebula, nor a planet's day sky over its horizon. One workgroup
// histograms all ~20k glow texels; thread 0 scans it. In the same loop, y: the
// median of the web's charted level (`web.wesl` `fsLevel`), about which the field
// dots thin, so a far plate whose every sight line is dense still shows its walls.

import package::antiqueLook::pigments::luma;

@group(0) @binding(0) var glowTex: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> floors: vec2<f32>;
@group(0) @binding(2) var webLevelTex: texture_2d<f32>;

const BINS: u32 = 256u;
// A day sky reaches well past half light: it must land in a bin of its own.
const RANGE: f32 = 1.0;
const PERCENTILE: f32 = 0.3;
const THREADS: u32 = 256u;
// The web's levels span its floor (-3.04, `WEB_FLOOR`) to past its top isobath.
const WEB_LEVEL_RANGE = vec2<f32>(-3.1, 7.0);

var<workgroup> histogram: array<atomic<u32>, 256>;
var<workgroup> skyCount: atomic<u32>;
var<workgroup> webHistogram: array<atomic<u32>, 256>;
var<workgroup> webCount: atomic<u32>;

// The level at `share` of a histogram's `count`, interpolated within its bin so it
// glides with the field instead of stepping by a bin (an outline would jump with it).
fn percentile(share: f32, count: u32, web: bool) -> f32 {
  let goal = share * f32(count);
  var below = 0.0;
  for (var b = 0u; b < BINS; b++) {
    let n = f32(select(atomicLoad(&histogram[b]), atomicLoad(&webHistogram[b]), web));
    if (below + n >= goal) {
      return (f32(b) + (goal - below) / max(n, 1.0)) / f32(BINS);
    }
    below += n;
  }
  return 0.0;
}

@compute @workgroup_size(256)
fn cs(@builtin(local_invocation_index) id: u32) {
  let size = textureDimensions(glowTex);
  let count = size.x * size.y;
  for (var i = id; i < count; i += THREADS) {
    let g = textureLoad(glowTex, vec2<u32>(i % size.x, i / size.x), 0);
    if (g.a >= 0.0) {
      atomicAdd(&histogram[min(u32(max(luma(g.rgb), 0.0) / RANGE * f32(BINS)), BINS - 1u)], 1u);
      atomicAdd(&skyCount, 1u);
    }
    let w = textureLoad(webLevelTex, vec2<u32>(i % size.x, i / size.x), 0);
    if (w.g > 0.5) {
      let t = (w.r - WEB_LEVEL_RANGE.x) / (WEB_LEVEL_RANGE.y - WEB_LEVEL_RANGE.x);
      atomicAdd(&webHistogram[min(u32(max(t, 0.0) * f32(BINS)), BINS - 1u)], 1u);
      atomicAdd(&webCount, 1u);
    }
  }
  workgroupBarrier();
  if (id != 0u) {
    return;
  }
  // No sky at all (a globe filling the frame): nothing to engrave, floor at zero.
  let web = percentile(0.5, atomicLoad(&webCount), true);
  floors = vec2<f32>(
    percentile(PERCENTILE, atomicLoad(&skyCount), false) * RANGE,
    mix(WEB_LEVEL_RANGE.x, WEB_LEVEL_RANGE.y, web),
  );
}
