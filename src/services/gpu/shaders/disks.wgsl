// disks.wgsl — oriented galaxy disks.
//
// Each instance is one tilted+rotated quad in WORLD space (unlike
// quads.wgsl, which is screen-aligned). Building the disk in world space
// means the projection matrix handles foreshortening naturally: a tilted
// disk projects to an ellipse on screen, exactly as it should.
//
// Frame construction (right-handed):
//   - Disk lies in a plane whose normal n is the line from the disk to
//     the camera (so a face-on disk normal points at the camera).
//   - First we build an axes pair (right, up) that span the disk plane,
//     orthogonal to n.
//   - We then rotate that pair around n by the position angle so the
//     disk's major axis aligns with the on-sky PA.
//   - Finally we squash the "up" basis by axisRatio to produce the
//     inclination — cos(i) = axisRatio is the standard disk inclination
//     formula.
// The result is a 2-vector basis (rightTilted, upTilted) we use to place
// each quad corner in world space before projection.

struct Uniforms {
  viewProj: mat4x4<f32>,
  viewport: vec2<f32>,
  _pad0: f32,
  _pad1: f32,
  camPos: vec3<f32>,
  _pad2: f32,
};

struct InstanceIn {
  @location(0) posSize: vec4<f32>,
  @location(1) uvRect:  vec4<f32>,
  @location(2) orient:  vec4<f32>,  // x: axisRatio, y: positionAngleDeg
};

struct VsOut {
  @builtin(position) clipPos:  vec4<f32>,
  @location(0)       atlasUv:  vec2<f32>,
  @location(1)       cornerUv: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u:        Uniforms;
@group(0) @binding(1) var          atlasTex: texture_2d<f32>;
@group(0) @binding(2) var          atlasSmp: sampler;

const CORNERS = array<vec2<f32>, 6>(
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0, -1.0),
  vec2<f32>( 1.0,  1.0),
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0,  1.0),
  vec2<f32>(-1.0,  1.0),
);

@vertex
fn vs(@builtin(vertex_index) vid: u32, instance: InstanceIn) -> VsOut {
  let corner = CORNERS[vid];
  let center = instance.posSize.xyz;
  let halfSize = instance.posSize.w * 0.5;
  // Clamp axisRatio so an edge-on disk still produces a thin sliver
  // rather than a degenerate zero-area quad (which would z-fight or
  // disappear entirely under sub-pixel rounding).
  let axisRatio = max(instance.orient.x, 0.05);
  let paDeg = instance.orient.y;
  let paRad = paDeg * 3.14159265 / 180.0;

  // Build a basis aligned with the line from the disk to the camera.
  // Using world-up (0,1,0) as the seed and Gram-Schmidting against n
  // produces a stable basis except in the degenerate case where n is
  // exactly vertical, where we substitute world-x.
  let n = normalize(u.camPos - center);
  let worldUpSeed = select(vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 0.0, 0.0), abs(n.y) > 0.99);
  let right = normalize(cross(worldUpSeed, n));
  let up    = cross(n, right);

  // Rotate (right, up) around n by paRad to align the major axis with PA.
  let cs = cos(paRad);
  let sn = sin(paRad);
  let rightPA = right * cs + up * sn;
  let upPA    = -right * sn + up * cs;

  // Squash up by axisRatio to produce inclination.
  let upTilt = upPA * axisRatio;

  // Place this corner in world space, then project.
  let world = center + (rightPA * corner.x + upTilt * corner.y) * halfSize;
  var out: VsOut;
  out.clipPos = u.viewProj * vec4<f32>(world, 1.0);

  let cornerUv = (corner + vec2<f32>(1.0, 1.0)) * 0.5;
  let uvLocal = vec2<f32>(cornerUv.x, 1.0 - cornerUv.y);
  out.atlasUv = mix(instance.uvRect.xy, instance.uvRect.zw, uvLocal);
  out.cornerUv = cornerUv;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  let rgba = textureSample(atlasTex, atlasSmp, in.atlasUv);
  // Soft circular mask — the disk geometry is already tilted in world
  // space, so the on-screen shape is a true ellipse from projection;
  // the mask just rounds the four corners of the (square) UV space.
  let r = length(in.cornerUv - vec2<f32>(0.5, 0.5));
  let mask = 1.0 - smoothstep(0.45, 0.5, r);
  // Brightness-derived alpha — same trick as quads.wgsl, lets the dark
  // sky in the cutout JPEG bleed transparent against the dot field.
  let lum = max(rgba.r, max(rgba.g, rgba.b));
  let lumAlpha = smoothstep(0.05, 0.30, lum);
  let alpha = lumAlpha * mask;
  return vec4<f32>(rgba.rgb * alpha, alpha);
}
