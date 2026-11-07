// antiqueLook/skyFloor.wesl — the field floor: the 30th percentile of the 1/16
// glow's luma over its sky texels, one f32 per frame, read by the plate in the
// same submit (a CPU readback would land a frame late). It scales the galaxy
// gate and outline level with the field, so a dense survey field is not engraved
// as one nebula, nor a planet's day sky over its horizon. One workgroup
// histograms all ~20k glow texels; thread 0 scans it.

import package::antiqueLook::pigments::luma;

@group(0) @binding(0) var glowTex: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> skyFloor: f32;

const BINS: u32 = 256u;
// A day sky reaches well past half light: it must land in a bin of its own.
const RANGE: f32 = 1.0;
const PERCENTILE: f32 = 0.3;
const THREADS: u32 = 256u;

var<workgroup> histogram: array<atomic<u32>, 256>;
var<workgroup> skyCount: atomic<u32>;

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
  }
  workgroupBarrier();
  if (id != 0u) {
    return;
  }
  // Interpolated within the bin, so the floor glides with the field instead of
  // stepping by a bin (the outline would jump with it).
  let goal = PERCENTILE * f32(atomicLoad(&skyCount));
  var below = 0.0;
  // No sky at all (a globe filling the frame): nothing to engrave, floor at zero.
  var level = 0.0;
  for (var b = 0u; b < BINS; b++) {
    let n = f32(atomicLoad(&histogram[b]));
    if (below + n >= goal) {
      level = (f32(b) + (goal - below) / max(n, 1.0)) * RANGE / f32(BINS);
      break;
    }
    below += n;
  }
  skyFloor = level;
}
