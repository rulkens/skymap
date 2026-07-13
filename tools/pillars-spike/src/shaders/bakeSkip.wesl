// bakeSkip.wesl — conservative distance-to-dust field, stage 2 of the
// empty-space-skipping bake, and the thing the raymarcher actually reads.
//
// For each coarse voxel: if its brick is occupied, distance 0; otherwise a
// bounded box search of the occupancy grid finds the nearest occupied
// brick and stores a CONSERVATIVE world distance — one cell shorter than
// the true gap, measured with the SMALLEST cell dimension — normalised by
// MAX_LEAP. nebula.wesl leaps by this distance through empty space,
// spending its fixed step budget in the dust instead of on vacuum.
//
// ## Why the leap can never skip over dust
//
// Two conservatisms stack. (1) The search is BOUNDED to SEARCH_R cells, so
// an un-found neighbour is reported at the search-box distance, always an
// UNDER-estimate of the true (larger) gap. (2) The stored distance shaves
// one cell and uses minCell (≤ every real cell edge), so it under-states
// the gap in every axis. An under-estimated empty distance means the
// marcher stops SHORT of dust and resumes fine stepping — never inside it.

import package::lib::volume::VOLUME_MIN;
import package::lib::volume::VOLUME_MAX;

struct SkipUniforms {
  zBase: u32,
  _p0: u32,
  _p1: u32,
  _p2: u32,
}

@group(0) @binding(0) var<uniform> u: SkipUniforms;
@group(0) @binding(1) var occ: texture_3d<f32>;
@group(0) @binding(2) var outSkip: texture_storage_3d<rgba8unorm, write>;

// A brick counts as occupied above this (matches nebula.wesl's dust+gas
// shading gate) — below it there is nothing to shade, so it is leapable.
const OCC_THRESH = 0.004;
const SEARCH_R = 6;
// The world distance a stored value of 1.0 encodes. MUST equal
// nebula.wesl's MAX_LEAP. Chosen just above SEARCH_R·minCell so the search
// bound, not this cap, is what limits a leap.
const MAX_LEAP = 0.35;

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid_in: vec3<u32>) {
  let gid = vec3<u32>(gid_in.x, gid_in.y, gid_in.z + u.zBase);
  let dims = textureDimensions(outSkip);
  if (gid.x >= dims.x || gid.y >= dims.y || gid.z >= dims.z) {
    return;
  }
  let dimsI = vec3<i32>(dims);
  let c = vec3<i32>(gid);

  // Occupied here → no leap.
  if (textureLoad(occ, c, 0).r > OCC_THRESH) {
    textureStore(outSkip, c, vec4<f32>(0.0));
    return;
  }

  // Smallest world cell edge — conservative for a leap in any direction.
  let cell = (VOLUME_MAX - VOLUME_MIN) / vec3<f32>(dims);
  let minCell = min(cell.x, min(cell.y, cell.z));

  var best = f32(SEARCH_R + 1); // Euclidean cell units; capped past the box.
  for (var dz = -SEARCH_R; dz <= SEARCH_R; dz = dz + 1) {
    for (var dy = -SEARCH_R; dy <= SEARCH_R; dy = dy + 1) {
      for (var dx = -SEARCH_R; dx <= SEARCH_R; dx = dx + 1) {
        let s = c + vec3<i32>(dx, dy, dz);
        if (s.x < 0 || s.y < 0 || s.z < 0 || s.x >= dimsI.x || s.y >= dimsI.y || s.z >= dimsI.z) {
          continue;
        }
        if (textureLoad(occ, s, 0).r > OCC_THRESH) {
          best = min(best, length(vec3<f32>(f32(dx), f32(dy), f32(dz))));
        }
      }
    }
  }

  let distWorld = max(0.0, best - 1.0) * minCell;
  textureStore(outSkip, c, vec4<f32>(clamp(distWorld / MAX_LEAP, 0.0, 1.0), 0.0, 0.0, 0.0));
}
