// asteroids/points/vertex.wesl — one screen-sized dot per row the Kepler compute kept, read from its
// compacted 'visible' list by a drawIndirect, so the instance index is a list slot, not a catalog row.
// 'vs' draws, 'vsPick' stamps the pick target; both read the one list, so a row the screen doesn't
// show can never take a click (the cull itself is the compute's). Both drop a dot a body hides
// (lib/trailOcclusion's pointClearance); the pick has no scene depth of its own, so it binds the far
// placeholder and only the occluder spheres drop a stamp.
//
// The unit constants mirror SCALE_UNITS, pinned by asteroidPoints.parity.test.ts.

import package::asteroids::points::io::AsteroidUniforms;
import package::asteroids::points::io::VSOut;
import package::asteroids::points::io::PickOut;
import package::asteroids::lib::visibleTag::visibleTagRow;
import package::asteroids::lib::visibleTag::visibleTagClass;
import package::lib::camera::worldToClip;
import package::lib::billboard::triCorner;
import package::lib::billboard::expandBillboardScreen;
import package::lib::starPhotometry::starPeakIntensity;
import package::lib::starPhotometry::toRefPx;
import package::lib::trailOcclusion::pointClearance;

// Group 0 bindings 0-1 are lib/trailOcclusion's.
@group(0) @binding(2) var<uniform> u: AsteroidUniforms;
// Heliocentric xyz (AU) and lifted flux per kept dot, and its visibleTag.
@group(0) @binding(3) var<storage, read> visible: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> visibleTags: array<u32>;

const AU_KM: f32 = 149597870.7;
const MPC_TO_KM: f32 = 3.0856775814913673e19;
// Clip w is in near-plane units (near0OverlayClipScale), so this only drops a dot at or behind the eye.
const W_EPS: f32 = 0.01;
// Mid-range in either depth convention: the draw target is depthless, and in the pick every caption
// stamp (pinned at the near end) out-picks a dot it overlaps.
const MID_DEPTH: f32 = 0.5;
// The selected dot's floor peak, enough to saturate the knee; with a gain of 1 / dotKnee lifting its
// ceiling to the stars' white, a followed dot reads among the stars whatever its flux.
const SELECTED_MIN_PEAK: f32 = 1.0;

struct AsteroidDot {
  relKm: vec3<f32>,
  flux: f32,
  cls: u32,
  row: u32,
};

fn asteroidDot(slot: u32) -> AsteroidDot {
  let entry = visible[slot];
  let tag = visibleTags[slot];
  let row = visibleTagRow(tag);
  var camRelAu = entry.xyz + u.sunFromCamAu;
  if (row == u.selectedRow) {
    camRelAu = u.selectedCamRelAu;
  }
  return AsteroidDot(camRelAu * AU_KM, entry.w, visibleTagClass(tag), row);
}

@vertex
fn vs(@builtin(vertex_index) vid: u32, @builtin(instance_index) slot: u32) -> VSOut {
  var out: VSOut; // zero-initialised: an early return is a degenerate, clipped vertex
  let d = asteroidDot(slot);
  let centre = worldToClip(u.cam, d.relKm / MPC_TO_KM);
  if (centre.w < W_EPS) {
    return out;
  }
  // Once per dot, not per fragment: a dot behind a body is dropped before it rasterises.
  let clear = pointClearance(d.relKm, centre);
  if (clear <= 0.0) {
    return out;
  }
  let selected = d.row == u.selectedRow;
  let sizePx = select(u.sizePx, max(u.sizePx, u.selectedRadiusPx), selected);
  let corner = triCorner(vid);
  let offset = expandBillboardScreen(u.cam, centre, sizePx, corner);
  let fade = u.classColor[d.cls].w * u.windowFade * clear;
  var peak = starPeakIntensity(1.0, d.flux * fade, toRefPx(sizePx, u.cam.pxPerRad));
  var rgb = u.classColor[d.cls].rgb;
  if (selected) {
    peak = max(peak, SELECTED_MIN_PEAK * fade);
    rgb /= u.dotKnee;
  }
  out.clip = vec4<f32>(centre.xy + offset, MID_DEPTH * centre.w, centre.w);
  out.corner = corner;
  out.tint = vec4<f32>(rgb, peak);
  return out;
}

@vertex
fn vsPick(@builtin(vertex_index) vid: u32, @builtin(instance_index) slot: u32) -> PickOut {
  var out: PickOut;
  let d = asteroidDot(slot);
  let centre = worldToClip(u.cam, d.relKm / MPC_TO_KM);
  if (centre.w < W_EPS || pointClearance(d.relKm, centre) < 0.5) {
    return out;
  }
  let corner = triCorner(vid);
  let offset = expandBillboardScreen(u.cam, centre, u.sizePx, corner);
  out.clip = vec4<f32>(centre.xy + offset, MID_DEPTH * centre.w, centre.w);
  out.corner = corner;
  out.word = u.pickBase + d.row;
  return out;
}
