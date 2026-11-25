// lib/horizonLookup.wesl — sun and sky visibility from a baked horizon map, shared by the
// surface tiles (their atlas, one slot per tile) and the whole globe (rect (0, 0, 1, 1)), so
// both read the same values where the cut starts. Spec §5–§7. 'rect' is in POST uv:
// (rect.xy + uv · rect.zw) · posts is the post coordinate, which 'horizonPostRect.ts' makes
// true of a tile's corner-inclusive 33 posts; the globe's posts wrap in longitude.

import package::lib::horizonAngleMap::horizonAngleOfUnorm;
import package::lib::horizonAngleMap::HORIZON_SECTORS;
import package::lib::math::TAU;

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

// The texel block of 'post', offset by 'blockTexel', as 'horizonTexelOf' lays it out. Longitude
// wraps (the globe; a no-op inside a tile slot), and every read stays inside the texture:
// out-of-bounds loads may return alpha 1, a 90° wall, where the 1 × 1 stand-in must read lit.
fn horizonTexel(atlas: texture_2d<f32>, post: vec2<u32>, blockTexel: vec2<u32>) -> vec4<f32> {
  let size = textureDimensions(atlas);
  let wrapped = vec2<u32>(post.x % max(size.x / 2u, 1u), post.y);
  return textureLoad(atlas, min(wrapped * 2u + blockTexel, size - 1u), 0);
}

// Horizon angle (rad) at one post toward 'sector' (fractional; sector k sits at k · 22.5°).
// Each sector is decoded before blending: the angle map has a knee.
fn horizonAngleAtPost(atlas: texture_2d<f32>, post: vec2<u32>, sector: f32) -> f32 {
  let lower = u32(floor(sector)) % u32(HORIZON_SECTORS);
  let upper = (lower + 1u) % u32(HORIZON_SECTORS);
  let below = horizonTexel(atlas, post, vec2<u32>((lower >> 2u) & 1u, lower >> 3u))[lower & 3u];
  let above = horizonTexel(atlas, post, vec2<u32>((upper >> 2u) & 1u, upper >> 3u))[upper & 3u];
  return mix(horizonAngleOfUnorm(below), horizonAngleOfUnorm(above), fract(sector));
}

// Visible fraction of the sun's disc at this point, 0..1.
fn horizonSunVisibility(atlas: texture_2d<f32>, rect: vec4<f32>, uv: vec2<f32>,
                        sunAzimuthRad: f32, sunElevationRad: f32, sunRadiusRad: f32) -> f32 {
  let cell = horizonCellAt(atlas, rect, uv);
  let sector = fract(sunAzimuthRad / TAU) * HORIZON_SECTORS;
  let north = mix(
    horizonAngleAtPost(atlas, cell.corner, sector),
    horizonAngleAtPost(atlas, cell.corner + vec2<u32>(1u, 0u), sector),
    cell.weights.x,
  );
  let south = mix(
    horizonAngleAtPost(atlas, cell.corner + vec2<u32>(0u, 1u), sector),
    horizonAngleAtPost(atlas, cell.corner + vec2<u32>(1u, 1u), sector),
    cell.weights.x,
  );
  let horizon = mix(north, south, cell.weights.y);
  return smoothstep(-sunRadiusRad, sunRadiusRad, sunElevationRad - horizon);
}

fn skyOpenness(horizonUnorm: vec4<f32>) -> f32 {
  let horizonRad = vec4<f32>(
    horizonAngleOfUnorm(horizonUnorm.x),
    horizonAngleOfUnorm(horizonUnorm.y),
    horizonAngleOfUnorm(horizonUnorm.z),
    horizonAngleOfUnorm(horizonUnorm.w),
  );
  let openCos = cos(max(horizonRad, vec4<f32>(0.0)));
  return dot(openCos * openCos, vec4<f32>(1.0));
}

fn horizonSkyAtPost(atlas: texture_2d<f32>, post: vec2<u32>) -> f32 {
  let sum = skyOpenness(horizonTexel(atlas, post, vec2<u32>(0u, 0u)))
    + skyOpenness(horizonTexel(atlas, post, vec2<u32>(1u, 0u)))
    + skyOpenness(horizonTexel(atlas, post, vec2<u32>(0u, 1u)))
    + skyOpenness(horizonTexel(atlas, post, vec2<u32>(1u, 1u)));
  return sum / HORIZON_SECTORS;
}

// Sky-view factor on a horizontal surface: mean over sectors of cos²(max(h, 0)).
fn horizonSkyVisibility(atlas: texture_2d<f32>, rect: vec4<f32>, uv: vec2<f32>) -> f32 {
  let cell = horizonCellAt(atlas, rect, uv);
  let north = mix(
    horizonSkyAtPost(atlas, cell.corner),
    horizonSkyAtPost(atlas, cell.corner + vec2<u32>(1u, 0u)),
    cell.weights.x,
  );
  let south = mix(
    horizonSkyAtPost(atlas, cell.corner + vec2<u32>(0u, 1u)),
    horizonSkyAtPost(atlas, cell.corner + vec2<u32>(1u, 1u)),
    cell.weights.x,
  );
  return mix(north, south, cell.weights.y);
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
