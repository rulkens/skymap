// splat.wesl — Gaussian splats as screen-space quads, EWA-projected (3DGS).
// The covariance projection (Sigma2D = J W Sigma Wt Jt, eigen bound, conic)
// follows Brush's WGSL kernels: github.com/ArthurBrussee/brush, Copyright
// Arthur Brussee, Apache License 2.0 (apache.org/licenses/LICENSE-2.0).
// 'cam.view' looks down -Z (wgpu-matrix lookAt), so depth is -t.z and the
// Jacobian's third column carries +t/depth^2, not the +Z-forward paper sign.
// 'cam.splatScale' scales Sigma2D (not just the quad): enlarging the quad
// alone would change nothing visible past 3 sigma.
// One module, two vertex entries: 'vs_deg0' never touches 'sh1', so the deg-0
// pipeline's group-1 layout legitimately omits binding 1.

import package::lib::sceneCamera::SceneCamera;

@group(0) @binding(0) var<uniform> cam: SceneCamera;
@group(1) @binding(0) var<storage, read> data: array<u32>;
@group(1) @binding(1) var<storage, read> sh1: array<u32>;

const WORDS_PER_SPLAT: u32 = 7u;
const WORDS_PER_SH1: u32 = 3u;
// Pixel-space variance floor: a sub-pixel splat still covers ~one texel.
const AA_FLOOR_PX2: f32 = 0.3;
const SH_C1: f32 = 0.4886025;

struct Splat {
  positionM: vec3<f32>,
  rotation: vec4<f32>,
  scaleM: vec3<f32>,
  opacity: f32,
  color: vec3<f32>,
};

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) @interpolate(flat) color: vec3<f32>,
  @location(1) @interpolate(flat) alpha: f32,
  @location(2) @interpolate(flat) conic: vec3<f32>,
  @location(3) dPx: vec2<f32>,
};

// Word map is packSplats.ts's: w3 rot i8x4 [x,y,z,w]; w4 logScale.xy f16x2;
// w5 = logScale.z f16 in the low half + opacity u8 at byte 22 (third byte);
// w6 = dcColor u8x3.
fn decodeSplat(idx: u32) -> Splat {
  let base = idx * WORDS_PER_SPLAT;
  var s: Splat;
  s.positionM = vec3<f32>(
    bitcast<f32>(data[base]),
    bitcast<f32>(data[base + 1u]),
    bitcast<f32>(data[base + 2u]),
  );
  // i8 quantisation leaves |q| slightly off 1; an unnormalised q scales Sigma.
  s.rotation = normalize(unpack4x8snorm(data[base + 3u]));
  let w5 = data[base + 5u];
  let logScale = vec3<f32>(unpack2x16float(data[base + 4u]), unpack2x16float(w5).x);
  s.scaleM = exp(logScale);
  s.opacity = unpack4x8unorm(w5).z;
  s.color = unpack4x8unorm(data[base + 6u]).xyz;
  return s;
}

fn quatToMat3(q: vec4<f32>) -> mat3x3<f32> {
  let x = q.x;
  let y = q.y;
  let z = q.z;
  let w = q.w;
  return mat3x3<f32>(
    vec3<f32>(1.0 - 2.0 * (y * y + z * z), 2.0 * (x * y + w * z), 2.0 * (x * z - w * y)),
    vec3<f32>(2.0 * (x * y - w * z), 1.0 - 2.0 * (x * x + z * z), 2.0 * (y * z + w * x)),
    vec3<f32>(2.0 * (x * z + w * y), 2.0 * (y * z - w * x), 1.0 - 2.0 * (x * x + y * y)),
  );
}

// Basis: SH1 for direction (x, y, z) is (-y, z, -x) * SH_C1, INRIA order.
fn sh1Color(idx: u32, dc: vec3<f32>, dir: vec3<f32>) -> vec3<f32> {
  let base = idx * WORDS_PER_SH1;
  let basis = SH_C1 * vec3<f32>(-dir.y, dir.z, -dir.x);
  let r = dot(unpack4x8snorm(sh1[base]).xyz, basis);
  let g = dot(unpack4x8snorm(sh1[base + 1u]).xyz, basis);
  let b = dot(unpack4x8snorm(sh1[base + 2u]).xyz, basis);
  return max(dc + vec3<f32>(r, g, b), vec3<f32>(0.0));
}

fn clippedVertex() -> VsOut {
  var out: VsOut;
  out.pos = vec4<f32>(0.0, 0.0, 2.0, 1.0);
  return out;
}

fn projectSplat(s: Splat, vi: u32, color: vec3<f32>) -> VsOut {
  let t = (cam.view * vec4<f32>(s.positionM, 1.0)).xyz;
  let depth = -t.z;
  if (depth <= 0.0) {
    return clippedVertex();
  }

  let rot = quatToMat3(s.rotation);
  let m = mat3x3<f32>(rot[0] * s.scaleM.x, rot[1] * s.scaleM.y, rot[2] * s.scaleM.z);
  let sigma = m * transpose(m);
  let w = mat3x3<f32>(cam.view[0].xyz, cam.view[1].xyz, cam.view[2].xyz);
  let focalPx = 1.0 / cam.metresPerPx;
  // J is 2x3; padding a zero third row lets one mat3 product carry it.
  let j = transpose(mat3x3<f32>(
    vec3<f32>(focalPx / depth, 0.0, focalPx * t.x / (depth * depth)),
    vec3<f32>(0.0, focalPx / depth, focalPx * t.y / (depth * depth)),
    vec3<f32>(0.0, 0.0, 0.0),
  ));
  let tt = j * w;
  let cov = tt * sigma * transpose(tt);
  let scale2 = cam.splatScale * cam.splatScale;
  let a = cov[0][0] * scale2 + AA_FLOOR_PX2;
  let b = cov[1][0] * scale2;
  let c = cov[1][1] * scale2 + AA_FLOOR_PX2;
  let det = a * c - b * b;
  if (det <= 0.0) {
    return clippedVertex();
  }

  let mid = 0.5 * (a + c);
  let lambdaMax = mid + sqrt(max(mid * mid - det, 0.0));
  let radiusPx = 3.0 * sqrt(lambdaMax);

  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1., -1.), vec2<f32>(1., -1.), vec2<f32>(-1., 1.),
    vec2<f32>(-1., 1.), vec2<f32>(1., -1.), vec2<f32>(1., 1.),
  );
  let dPx = corners[vi] * radiusPx;
  // Pixel offset -> world offset along the screen axes (same scheme as
  // lidarPoint.wesl); rightM/upM are exactly the view matrix's x/y rows.
  let offsetM = (cam.rightM * dPx.x + cam.upM * dPx.y) * cam.metresPerPx * depth;

  var out: VsOut;
  out.pos = cam.viewProj * vec4<f32>(s.positionM + offsetM, 1.0);
  out.color = color;
  out.alpha = s.opacity * cam.opacityScale;
  out.conic = vec3<f32>(c, -b, a) / det;
  out.dPx = dPx;
  return out;
}

@vertex
fn vs_deg0(@builtin(vertex_index) vi: u32, @location(0) idx: u32) -> VsOut {
  let s = decodeSplat(idx);
  return projectSplat(s, vi, s.color);
}

@vertex
fn vs_deg1(@builtin(vertex_index) vi: u32, @location(0) idx: u32) -> VsOut {
  let s = decodeSplat(idx);
  let dir = normalize(s.positionM - cam.eyeM);
  return projectSplat(s, vi, sh1Color(idx, s.color, dir));
}

@fragment
fn fs(i: VsOut) -> @location(0) vec4<f32> {
  let d = i.dPx;
  let power = -0.5 * (i.conic.x * d.x * d.x + 2.0 * i.conic.y * d.x * d.y + i.conic.z * d.y * d.y);
  let alpha = i.alpha * exp(power);
  if (alpha < 1.0 / 255.0) {
    discard;
  }
  // Capped below 1 so no single splat writes full coverage and terminates the
  // back-to-front chain early — Brush's own kernels cap at the same place.
  return vec4<f32>(i.color, min(alpha, 0.99));
}
