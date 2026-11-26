// lib/horizonLookup.wesl — sun and sky visibility from a baked horizon map, shared by the
// surface tiles (their atlas, one slot per tile) and the whole globe (rect (0, 0, 1, 1)), so
// both read the same values where the cut starts. Spec §5–§7. 'rect' is in POST uv:
// (rect.xy + uv · rect.zw) · posts is the post coordinate, which 'horizonPostRect.ts' makes
// true of a tile's corner-inclusive 129 posts; the globe's posts wrap in longitude. A zero rect
// means "no horizon data": the lookup skips the map and reads fully lit, the look without it.

import package::lib::horizonAngleMap::horizonAnglesOfUnorm;
import package::lib::horizonAngleMap::HORIZON_SECTORS;
import package::lib::math::TAU;

// False on coarse-pointer devices ('horizonLookupConstants.ts', which every pipeline linking
// this passes): the sun alone, at half the loads, and the sky term reads 1 (spec §7).
override HORIZON_SKY: bool = true;

// The cell under 'uv': its north-west post and the bilinear weights toward the next posts.
struct HorizonCell {
  corner: vec2<u32>,
  weights: vec2<f32>,
};

fn horizonCellAt(atlas: texture_2d<f32>, rect: vec4<f32>, uv: vec2<f32>) -> HorizonCell {
  let posts = vec2<f32>(textureDimensions(atlas)) * 0.5;
  let start = rect.xy * posts;
  let end = (rect.xy + rect.zw) * posts;
  let postPos = start + uv * rect.zw * posts;
  // A sub-rect never leaves the slot it addresses: the cell stays inside the rect's own posts.
  let firstCell = floor(start + 1e-3);
  let lastCell = max(firstCell, ceil(end - 1e-3) - 1.0);
  let cell = clamp(floor(postPos), firstCell, lastCell);
  return HorizonCell(vec2<u32>(cell), clamp(postPos - cell, vec2<f32>(0.0), vec2<f32>(1.0)));
}

// Sector k's texel in its post's 2 × 2 block (xy) and its channel (z): 'horizonTexelOf.ts',
// tied to it by a scraper test.
fn horizonSectorTexel(sector: u32) -> vec3<u32> {
  return vec3<u32>((sector >> 2u) & 1u, (sector >> 3u) & 1u, sector & 3u);
}

// A post's 2 × 2 texel block. Longitude wraps (the globe; a no-op inside a tile slot).
// Latitude clamps by POST, never by texel: the globe has no south-pole row, and a texel clamp
// would land both block rows on one, reading sectors 0–7 as 8–15.
fn horizonPostBlock(atlas: texture_2d<f32>, post: vec2<u32>) -> vec2<u32> {
  let posts = max(textureDimensions(atlas) / 2u, vec2<u32>(1u));
  return vec2<u32>(post.x % posts.x, min(post.y, posts.y - 1u)) * 2u;
}

// The four sector angles (rad) of the block's texel 'texel'.
fn horizonTexelAngles(atlas: texture_2d<f32>, block: vec2<u32>, texel: vec2<u32>) -> vec4<f32> {
  return horizonAnglesOfUnorm(textureLoad(atlas, min(block + texel, textureDimensions(atlas) - 1u), 0));
}

// One post's 16 sector angles, one load per block texel: column x + 2y holds texel (x, y).
fn horizonPostAngles(atlas: texture_2d<f32>, block: vec2<u32>) -> mat4x4<f32> {
  return mat4x4<f32>(
    horizonTexelAngles(atlas, block, vec2<u32>(0u, 0u)),
    horizonTexelAngles(atlas, block, vec2<u32>(1u, 0u)),
    horizonTexelAngles(atlas, block, vec2<u32>(0u, 1u)),
    horizonTexelAngles(atlas, block, vec2<u32>(1u, 1u)),
  );
}

// The angle of the sector whose texel is 'texel' ('horizonSectorTexel').
fn horizonSectorAngle(angles: mat4x4<f32>, texel: vec3<u32>) -> f32 {
  return angles[texel.x + 2u * texel.y][texel.z];
}

// cos²(h) ≈ 1 + c.x·h² + c.y·h⁴ + c.z·h⁶: a minimax fit over [0, π/2], within 8.2e-4, and
// exactly 1 at h = 0, so open ground still reads 1; it stands in for a cos per sector.
const COS_SQUARED_FIT: vec3<f32> = vec3<f32>(-0.99312801, 0.31585450, -0.03150899);

fn horizonOpenness(angles: vec4<f32>) -> vec4<f32> {
  let open = max(angles, vec4<f32>(0.0));
  let squared = open * open;
  return 1.0 + squared * (COS_SQUARED_FIT.x + squared * (COS_SQUARED_FIT.y + squared * COS_SQUARED_FIT.z));
}

// Mean over a post's sectors of cos²(max(h, 0)).
fn horizonSkyAtPost(angles: mat4x4<f32>) -> f32 {
  let total = horizonOpenness(angles[0]) + horizonOpenness(angles[1])
    + horizonOpenness(angles[2]) + horizonOpenness(angles[3]);
  return dot(total, vec4<f32>(1.0 / HORIZON_SECTORS));
}

// Visible fraction of the sun's disc (x) and the sky-view factor on a horizontal surface (y),
// both 0..1, from the four posts around 'uv'. One post is live at a time: holding all four
// decoded and blending them before the sun's pick tripled the pass. Without HORIZON_SKY each
// post loads only the texels of the two sunward sectors (8 loads, not 16), the same sun.
fn horizonVisibility(atlas: texture_2d<f32>, rect: vec4<f32>, uv: vec2<f32>,
                     sunAzimuthRad: f32, sunElevationRad: f32, sunRadiusRad: f32) -> vec2<f32> {
  if (rect.z == 0.0) {
    return vec2<f32>(1.0);
  }
  let cell = horizonCellAt(atlas, rect, uv);
  let sector = fract(sunAzimuthRad / TAU) * HORIZON_SECTORS;
  let lower = horizonSectorTexel(u32(floor(sector)) % u32(HORIZON_SECTORS));
  let upper = horizonSectorTexel((u32(floor(sector)) + 1u) % u32(HORIZON_SECTORS));
  var horizon = 0.0;
  var sky = 0.0;
  for (var corner = 0u; corner < 4u; corner++) {
    let offset = vec2<u32>(corner & 1u, corner >> 1u);
    let axisWeights = mix(1.0 - cell.weights, cell.weights, vec2<f32>(offset));
    let weight = axisWeights.x * axisWeights.y;
    let block = horizonPostBlock(atlas, cell.corner + offset);
    if (HORIZON_SKY) {
      let angles = horizonPostAngles(atlas, block);
      horizon += weight * mix(horizonSectorAngle(angles, lower), horizonSectorAngle(angles, upper), fract(sector));
      sky += weight * horizonSkyAtPost(angles);
    } else {
      let lowerAngle = horizonTexelAngles(atlas, block, lower.xy)[lower.z];
      let upperAngle = horizonTexelAngles(atlas, block, upper.xy)[upper.z];
      horizon += weight * mix(lowerAngle, upperAngle, fract(sector));
    }
  }
  let sun = smoothstep(-sunRadiusRad, sunRadiusRad, sunElevationRad - horizon);
  return vec2<f32>(sun, select(1.0, sky, HORIZON_SKY));
}

// Sun azimuth (clockwise from north) and elevation in the local east/north/up frame of `up`.
// Pole convention, the bake's own ('marchHorizonSector'): the frame comes from up's longitude
// λ with no special case, east = (−sin λ, cos λ, 0), north = (−sin φ cos λ, −sin φ sin λ, cos φ).
fn localSunAngles(up: vec3<f32>, sunDirLocal: vec3<f32>) -> vec2<f32> {
  let unitUp = normalize(up);
  let lon = atan2(unitUp.y, unitUp.x);
  let east = vec3<f32>(-sin(lon), cos(lon), 0.0);
  let north = vec3<f32>(-unitUp.z * cos(lon), -unitUp.z * sin(lon), length(unitUp.xy));
  let towardEast = dot(sunDirLocal, east);
  let towardNorth = dot(sunDirLocal, north);
  let azimuth = atan2(towardEast, towardNorth);
  let elevation = atan2(dot(sunDirLocal, unitUp), length(vec2<f32>(towardEast, towardNorth)));
  return vec2<f32>(azimuth, elevation);
}
