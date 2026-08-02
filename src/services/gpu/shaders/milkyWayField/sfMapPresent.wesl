// milkyWayField/sfMapPresent.wesl — presents the SSPSF automaton's packed
// output (sfMapPack.wesl) in place of the analytic field's emission draw
// when render.sfMapView is on, same seam as dustPresent.wesl.
//
// Unlike dustPresent.wesl's 1:1 texel read (its map is already screen-space,
// splatted there by dustMap.wesl), sfMapTex is GALAXY-FRAME log-polar: this
// shader reconstructs the camera ray per fragment (io.wesl's own basis, the
// same formula splat.wesl's fs uses) and intersects the disc plane (y=0 —
// the warp is ignored, a diagnostic overlay's own simplification, not
// claimed anywhere else) to find which (r, theta) texel to sample. That
// resample makes this pass's own target resolution independent of the map's
// — there is no equal-extent 1:1-load contract here to violate (research
// doc §17.1's decimation trap).

import package::lib::fullscreenTri::fullscreenVertex;
import package::lib::fullscreenTri::FullscreenOut;
import package::milkyWayField::io::u;

const PI: f32 = 3.14159265358979;

// rMin/rMax: the log-radial bounds THIS galaxy's grid was built over
// (galaxySfMapArmForcing.ts's sfMapGridRadius) — written once per
// rebuildSfMap, not every frame like io.wesl's 'u' above.
struct SfMapGrid {
  rMin: f32,
  rMax: f32,
}

@group(0) @binding(1) var sfMapTex: texture_2d<f32>;
@group(0) @binding(2) var sfMapSmp: sampler;
@group(0) @binding(3) var<uniform> grid: SfMapGrid;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> FullscreenOut {
  return fullscreenVertex(vi);
}

@fragment
fn fs(input: FullscreenOut) -> @location(0) vec4<f32> {
  let tanHalfFov = u.params.x;
  let aspect = u.params.y;
  let shift = u.params.z;
  // FullscreenOut carries 'uv' (its @builtin(position) is FRAMEBUFFER
  // pixels in the fragment stage, not NDC) — undo fullscreenVertex's own
  // uv transform to recover the NDC splat.wesl's fs reconstructs its ray
  // from.
  let ndcX = input.uv.x * 2.0 - 1.0;
  let ndcY = 1.0 - input.uv.y * 2.0;
  let d = normalize(
    u.camRight.xyz * ((ndcX + shift) * tanHalfFov * aspect)
      + u.camUp.xyz * (ndcY * tanHalfFov)
      + u.camFwd.xyz,
  );
  let o = u.eye.xyz;

  // Disc-plane (y=0) intersection; a ray parallel to or diverging from the
  // plane has nothing to show.
  if (abs(d.y) < 1e-6) {
    return vec4<f32>(0.0);
  }
  let t = -o.y / d.y;
  if (t <= 0.0) {
    return vec4<f32>(0.0);
  }
  let hit = o + d * t;
  let r = length(hit.xz);
  let theta = atan2(hit.z, hit.x);

  if (r < grid.rMin || r > grid.rMax) {
    return vec4<f32>(0.0);
  }
  let ringT = log(r / grid.rMin) / log(grid.rMax / grid.rMin);
  let azT = theta / (2.0 * PI) + select(0.0, 1.0, theta < 0.0);
  let texel = textureSampleLevel(sfMapTex, sfMapSmp, vec2<f32>(azT, ringT), 0.0);

  // Fade the last few percent toward each radial edge so the map doesn't
  // end in a hard ring — presentation, not physics.
  let edgeFade = smoothstep(0.0, 0.03, ringT) * (1.0 - smoothstep(0.94, 1.0, ringT));

  let gas = texel.x;
  let recent = texel.y;
  let old = texel.z;
  // Presentation palette, NOT physics — chosen so the three channels stay
  // separable by eye: dim cool blue for unspent gas, warm amber for the
  // decaying wake, hot white for a cell that ignited recently.
  let gasColor = vec3<f32>(0.05, 0.08, 0.25) * gas;
  let oldColor = vec3<f32>(0.9, 0.35, 0.05) * old;
  let recentColor = vec3<f32>(1.0, 0.95, 0.85) * recent;
  let color = (gasColor + oldColor + recentColor) * edgeFade;

  return vec4<f32>(color, 0.0);
}
