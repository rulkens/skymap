// disks.wgsl — oriented galaxy disks (astronomically correct).
//
// Each instance is a 3D disk fixed in WORLD space.  The galaxy's true
// orientation is derived from its on-sky position angle (PA, east of
// north) and its inclination i where cos(i) = axisRatio (b/a).  These
// are intrinsic properties of the galaxy in 3D space — they do NOT
// depend on the camera position.  Foreshortening then falls out of the
// perspective projection naturally: tilt the camera and the disk's
// projected ellipse changes accordingly.
//
// ### Why this approach instead of "always face the camera"
//
// The first cut of this shader built a basis from `camPos - center` and
// squashed it by axisRatio.  That made the disk plane track the camera,
// so axisRatio became a 2D screen-space squash — visually identical to
// the points-shader's elliptical billboard mask, with no real 3D
// foreshortening.  Worse, near the celestial poles the seed vector
// (used to break the up/right ambiguity) flipped abruptly when the
// camera-relative normal crossed a threshold, snapping the basis.
//
// Building in world space fixes both: the disk has ONE orientation in
// 3D regardless of camera, so orbiting reveals the true ellipse
// foreshortening; and the only singularity is now galaxies physically
// at the celestial poles (Dec ≈ ±90°), which is independent of camera
// motion and easily handled with a fallback seed.
//
// ### Frame construction (right-handed, world-fixed)
//
//   1. losDir = normalize(center - origin)
//      Earth (the observer) sits at world origin.  losDir is the
//      direction from Earth to the galaxy — the line of sight.
//   2. north_proj = normalize(NORTH_POLE - dot(NORTH_POLE, losDir) *
//                             losDir)
//      Project the celestial north pole vector onto the sky tangent
//      plane at the galaxy's position.  Falls back to (0,1,0) when the
//      galaxy is within ~8° of the pole.
//   3. east_proj = cross(north_proj, losDir)
//      Right-handed 3-axis at the galaxy: (north_proj, east_proj,
//      losDir).
//   4. major = north_proj * cos(PA) + east_proj * sin(PA)
//      Position angle is east of north.
//   5. minor_in_sky = cross(losDir, major)
//      In-sky perpendicular to the major axis.
//   6. minor_3d = minor_in_sky * cosI + losDir * sinI
//      where cosI = axisRatio.  Rotates the disk's true minor axis out
//      of the sky plane toward the observer by inclination angle i.
//      Face-on (axisRatio = 1, sinI = 0) → minor_3d = minor_in_sky →
//      disk lies entirely in the sky plane → projects as a circle.
//      Edge-on (axisRatio → 0, cosI → 0, sinI → 1) → minor_3d ≈ losDir
//      → disk is nearly parallel to the line of sight → projects as a
//      thin streak along the major axis.
//
// The disk basis is (major, minor_3d), both unit length and orthogonal.
// Each corner is placed at center + (corner.x * major + corner.y *
// minor_3d) * halfSize, then projected via viewProj.

struct Uniforms {
  viewProj: mat4x4<f32>,
  viewport: vec2<f32>,
  _pad0: f32,
  _pad1: f32,
  // camPos is preserved in the layout for ABI continuity with the JS
  // upload path, but the world-fixed disk math doesn't read it: the
  // disk's orientation is an intrinsic galaxy property, independent of
  // where the camera sits.  The camera contributes only via viewProj
  // (which is also a uniform, see above).
  camPos: vec3<f32>,
  _pad2: f32,
};

struct InstanceIn {
  @location(0) posSize: vec4<f32>,
  @location(1) uvRect:  vec4<f32>,
  // x: axisRatio, y: positionAngleDeg, z: fadeAlpha (per-frame distance ×
  // load fade multiplier from the engine), w: reserved padding.
  @location(2) orient:  vec4<f32>,
};

struct VsOut {
  @builtin(position) clipPos:   vec4<f32>,
  @location(0)       atlasUv:   vec2<f32>,
  @location(1)       cornerUv:  vec2<f32>,
  // Per-instance fade multiplier in [0, 1].
  @location(2)       fadeAlpha: f32,
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

  // ── Line of sight ────────────────────────────────────────────────────
  //
  // Earth (the observer) is at world origin in this coordinate system —
  // the build pipeline's `raDecZToCartesian` places galaxies relative
  // to that point.  losDir is therefore the direction from Earth to
  // the galaxy.  Note: this is NOT the camera direction — the disk's
  // orientation must be camera-independent, otherwise orbiting would
  // make the disk visibly rotate (which it shouldn't).
  let losDir = normalize(center);

  // ── Sky tangent basis (north / east at the galaxy's position) ────────
  //
  // The celestial north pole is at Dec = +90°, which the build
  // pipeline maps to world-space (0, 0, 1).  Project that vector onto
  // the plane perpendicular to losDir to get the in-sky "north"
  // direction at the galaxy's position.
  //
  // Singularity: when the galaxy is within ~8° of the celestial pole
  // (|losDir.z| > 0.99), `northPole - dot(...) * losDir` shrinks to
  // near-zero and normalize() amplifies floating-point noise.  Fall
  // back to seeding with world-y in that case — for the handful of
  // real galaxies that close to the pole the resulting PA is still
  // well-defined, just measured against a different (consistent)
  // reference direction.
  let northPole = vec3<f32>(0.0, 0.0, 1.0);
  let nearPole = abs(dot(northPole, losDir)) > 0.99;
  let seed = select(northPole, vec3<f32>(0.0, 1.0, 0.0), nearPole);
  let north_proj = normalize(seed - dot(seed, losDir) * losDir);
  let east_proj  = cross(north_proj, losDir);

  // ── Major axis on the sky ────────────────────────────────────────────
  //
  // Astronomical PA is measured east of north — increasing PA rotates
  // the major axis from north toward east.
  let cs = cos(paRad);
  let sn = sin(paRad);
  let major = north_proj * cs + east_proj * sn;

  // ── Tilt the disk's true minor axis out of the sky plane ─────────────
  //
  // For a face-on galaxy (axisRatio = 1, inclination i = 0°), the disk
  // minor axis lies entirely in the sky plane perpendicular to major.
  // For an edge-on galaxy (axisRatio = 0, i = 90°), the disk minor
  // axis points along the line of sight.  Interpolate using cos(i) =
  // axisRatio:
  //
  //   minor_3d = minor_in_sky · cos(i) + losDir · sin(i)
  //
  // This is the disk's REAL minor axis in 3D.  When projected onto the
  // sky plane, its sky-projection length is cos(i) = axisRatio — which
  // matches the observed b/a, by definition.
  let minor_in_sky = cross(losDir, major);
  let cosI = axisRatio;
  let sinI = sqrt(max(0.0, 1.0 - cosI * cosI));
  let minor_3d = minor_in_sky * cosI + losDir * sinI;

  // Place the corner in world space using (major, minor_3d) as the
  // disk's basis.  No squash needed — the basis vectors are already
  // unit length, and the inclination foreshortening will appear
  // automatically when the camera projects them.
  let world = center + (major * corner.x + minor_3d * corner.y) * halfSize;
  var out: VsOut;
  out.clipPos = u.viewProj * vec4<f32>(world, 1.0);

  let cornerUv = (corner + vec2<f32>(1.0, 1.0)) * 0.5;
  let uvLocal = vec2<f32>(cornerUv.x, 1.0 - cornerUv.y);
  out.atlasUv = mix(instance.uvRect.xy, instance.uvRect.zw, uvLocal);
  out.cornerUv = cornerUv;
  out.fadeAlpha = instance.orient.z;
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
  let alpha = lumAlpha * mask * in.fadeAlpha;
  return vec4<f32>(rgba.rgb * alpha, alpha);
}
