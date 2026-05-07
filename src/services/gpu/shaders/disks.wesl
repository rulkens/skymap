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
// The first cut of this shader built a basis from 'camPos - center' and
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

// CameraUniforms covers the canonical 80-byte prefix shared by every
// world-space renderer (viewProj + viewportPx + 8B pad).  The disks
// vertex stage only consults 'viewProj' via 'worldToClip' — the disk
// math is camera-independent by design (see the docblock above) — so
// 'worldToNdc' / 'worldEyeDepth' aren't imported.  Restraint matches
// what filaments + quads already adopted in this WESL conversion.
import package::lib::camera::CameraUniforms;
import package::lib::camera::worldToClip;
// Shared unit-quad helpers from 'lib/billboard.wesl' — replace the
// inline 'CORNERS' const + '(corner + 1) * 0.5' UV remap that used to
// live below. The orientation-aligned disk-plane basis (PA +
// inclination → 'major' / 'minor_3d' in 3D world space) stays
// renderer-specific; only the vertex-index → corner / UV lookups are
// shared. See the docblock at the top of 'lib/billboard.wesl' for why
// the orientation math is intentionally NOT pulled into this lib.
import package::lib::billboard::quadCorner;
import package::lib::billboard::quadUv;
// Disk-plane axis math (PA + inclination → world-space major/minor basis)
// is shared with 'proceduralDisks.wesl' via 'lib/orientation.wesl'. The
// inline derivation that used to live in this file's vs() body — the
// los/north/east/major/minor chain — is now the lib's 'diskAxes' fn,
// byte-equivalent for disks since the lib standardised on the wider
// '|dot(north, los)| > 0.99' (~8°) pole-fallback threshold that disks
// already used. See 'lib/orientation.wesl' for the camera-independence
// invariant + the pole-degeneracy discussion.
import package::lib::orientation::DiskAxes;
import package::lib::orientation::diskAxes;

struct Uniforms {
  cam: CameraUniforms,
  // camPos is preserved in the layout for ABI continuity with the JS
  // upload path, but the world-fixed disk math doesn't read it: the
  // disk's orientation is an intrinsic galaxy property, independent of
  // where the camera sits.  The camera contributes only via
  // 'cam.viewProj' (consumed by 'worldToClip').
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

@vertex
fn vs(@builtin(vertex_index) vid: u32, instance: InstanceIn) -> VsOut {
  // Unit-square corner offset in [-1, +1]² for this triangle-list
  // vertex. Pulled from 'lib/billboard::quadCorner' so the (BL, BR,
  // TR, BL, TR, TL) ordering is shared across all four billboard
  // renderers — see the lib's docblock for the corner-ordering
  // discussion. The corner here is in the disk's LOCAL 2D frame; the
  // 3D placement happens via the (major, minor_3d) basis below.
  let corner = quadCorner(vid);
  let center = instance.posSize.xyz;
  let halfSize = instance.posSize.w * 0.5;
  // Clamp axisRatio so an edge-on disk still produces a thin sliver
  // rather than a degenerate zero-area quad (which would z-fight or
  // disappear entirely under sub-pixel rounding).
  let axisRatio = max(instance.orient.x, 0.05);
  let paDeg = instance.orient.y;
  let paRad = paDeg * 3.14159265 / 180.0;

  // ── Disk-plane basis (PA + inclination → world-space major / minor) ─
  //
  // The full derivation — line-of-sight from Earth-at-origin, sky-tangent
  // (north, east) frame with pole fallback, PA-east-of-north rotation,
  // and inclination tilt of the minor axis out of the sky plane — lives
  // in 'lib/orientation.wesl'. See its docblock for the camera-
  // independence invariant and the ~8°-from-pole degeneracy fallback.
  // 'axisRatio' is clamped at the call site (above) BEFORE we feed it
  // through as cosI, because the lib intentionally doesn't re-clamp.
  let cosI = axisRatio;
  let sinI = sqrt(max(0.0, 1.0 - cosI * cosI));
  let axes = diskAxes(center, paRad, cosI, sinI);
  let major = axes.major;
  let minor_3d = axes.minor;

  // Place the corner in world space using (major, minor_3d) as the
  // disk's basis.  No squash needed — the basis vectors are already
  // unit length, and the inclination foreshortening will appear
  // automatically when the camera projects them.
  let world = center + (major * corner.x + minor_3d * corner.y) * halfSize;
  var out: VsOut;
  out.clipPos = worldToClip(u.cam, world);

  // 'quadUv' returns the unit-square corner remapped to [0, 1]² (same
  // vertex-index ordering as 'quadCorner' above). We then flip V so
  // the texture isn't upside down — matches the atlas's top-down
  // 'flipY: false' upload convention used by 'quads.wesl'.
  let cornerUv = quadUv(vid);
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
  // Discard near-transparent fragments so we don't waste blend
  // bandwidth on near-zero contributions.  See 'quads.wgsl' for
  // the longer note — same reasoning applies here.
  if (alpha < 0.01) { discard; }
  return vec4<f32>(rgba.rgb * alpha, alpha);
}
