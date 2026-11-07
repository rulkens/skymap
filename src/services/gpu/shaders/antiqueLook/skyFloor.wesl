// antiqueLook/skyFloor.wesl — the field floor: the 30th percentile of the 1/16
// glow's luma, one f32 per frame, read by the plate in the same submit (a CPU
// readback would land a frame late). It scales the galaxy gate and outline level
// with the field, so a dense survey field is not engraved as one nebula. One
// workgroup histograms all ~20k glow texels; thread 0 scans it.

import package::antiqueLook::pigments::luma;

@group(0) @binding(0) var glowTex: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> skyFloor: f32;

const BINS: u32 = 128u;
const RANGE: f32 = 0.5;
const PERCENTILE: f32 = 0.3;
const THREADS: u32 = 256u;

var<workgroup> histogram: array<atomic<u32>, 128>;

@compute @workgroup_size(256)
fn cs(@builtin(local_invocation_index) id: u32) {
  let size = textureDimensions(glowTex);
  let count = size.x * size.y;
  for (var i = id; i < count; i += THREADS) {
    let l = luma(textureLoad(glowTex, vec2<u32>(i % size.x, i / size.x), 0).rgb);
    atomicAdd(&histogram[min(u32(max(l, 0.0) / RANGE * f32(BINS)), BINS - 1u)], 1u);
  }
  workgroupBarrier();
  if (id != 0u) {
    return;
  }
  // Interpolated within the bin, so the floor glides with the field instead of
  // stepping by a bin (the outline would jump with it).
  let goal = PERCENTILE * f32(count);
  var below = 0.0;
  var level = RANGE;
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
