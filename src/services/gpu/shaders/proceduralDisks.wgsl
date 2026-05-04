// proceduralDisks.wgsl — 3D-oriented procedural galaxy impostors.
//
// Sibling pass to `disks.wgsl` (texture-based disks) and `points.wgsl`
// (screen-aligned billboards).  Renders every galaxy whose apparent
// size exceeds 8 px (with a crossfade up to 14 px) as a 3D-oriented
// quad shaded with a two-component brightness profile (Gaussian bulge
// + exponential disk).  No texture sampling — the fragment stage
// generates the shape entirely from per-fragment math.
//
// The vertex stage is structurally identical to disks.wgsl: we
// construct an in-plane orthonormal basis from `axisRatio` (which
// encodes inclination via `cos(i) = axisRatio` for thin disks) and
// `positionAngleDeg` (east-of-north major-axis direction on the sky),
// then offset the corner vertices into world space.  See disks.wgsl
// for the full derivation; we trust that derivation here and re-use
// the math.

struct Uniforms {
  viewProj: mat4x4<f32>,
  viewport: vec2<f32>,
  _pad0: f32,
  _pad1: f32,
  camPosWorld: vec3<f32>,
  pxPerRad: f32,
};

struct InstanceIn {
  @location(0) posSize: vec4<f32>,         // x, y, z, sizeWorldMpc
  @location(1) orientation: vec4<f32>,     // axisRatio, positionAngleDeg, _, _
  @location(2) extras: vec4<f32>,          // colourIndex, crossfadeAlpha, _, _
};

struct VsOut {
  @builtin(position) clipPos: vec4<f32>,
  // Disk-local UV in [-1, 1]² — used by the fragment shader to compute
  // radial distance for the brightness profile.
  @location(0) uv: vec2<f32>,
  // Per-instance colour-index value (forwarded for the colour ramp).
  @location(1) @interpolate(flat) colourIndex: f32,
  // Per-instance crossfade alpha (0..1).
  @location(2) @interpolate(flat) crossfadeAlpha: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

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

  // ── Disk-plane basis construction ────────────────────────────────────
  //
  // The galaxy's *major axis* direction on the sky is given by PA (east
  // of north).  In skymap world coords (+Z = celestial north), the
  // local sky-tangent at the galaxy's position has +Y as celestial north
  // and -X as east (after we factor out the line-of-sight).  We build
  // the major-axis world direction by rotating the local sky-north
  // vector by PA toward east, projected into the sky-tangent plane.
  //
  // Then the minor axis is perpendicular to the major axis IN THE
  // GALAXY'S DISK PLANE — which is *not* the sky-tangent plane.  The
  // disk is tilted by inclination i = acos(axisRatio).  We compute the
  // disk normal as the line-of-sight direction rotated by (90° - i)
  // toward the perpendicular-to-major-axis sky direction.  The minor
  // axis then lies in the plane perpendicular to (major × normal).
  //
  // Implementation reuses the same algebra as disks.wgsl — see that
  // file for the full step-by-step derivation including the sign
  // conventions for sky-east vs world-X.
  let pos = instance.posSize.xyz;
  let halfWorld = instance.posSize.w;
  let axisRatio = instance.orientation.x;
  let paRad = instance.orientation.y * 3.14159265 / 180.0;

  // Line of sight (camera → galaxy).
  let los = normalize(pos - u.camPosWorld);

  // Local sky-north and sky-east at the galaxy.  We Gram-Schmidt
  // celestial-north (+Z world) against `los` to get the sky-north
  // tangent direction; sky-east is then los × sky-north.
  let CELESTIAL_NORTH = vec3<f32>(0.0, 0.0, 1.0);
  let northTangentRaw = CELESTIAL_NORTH - los * dot(CELESTIAL_NORTH, los);
  let northLen = length(northTangentRaw);
  // Pole degeneracy: if the line of sight is essentially along the
  // celestial pole, the sky-tangent has no defined "north".  Fall back
  // to using world +Y as the in-plane reference.  Picking +Y is
  // arbitrary but consistent (every pole-on viewing renders with the
  // same fallback orientation) and the loss of sky-PA fidelity at the
  // poles is invisible in practice.
  let northTangent = select(
    northTangentRaw / northLen,
    vec3<f32>(0.0, 1.0, 0.0),
    northLen < 1e-4,
  );
  let eastTangent = cross(los, northTangent);

  // Major axis on sky: rotate sky-north by PA toward sky-east.
  let majorSky = northTangent * cos(paRad) + eastTangent * sin(paRad);
  // Perpendicular-to-major in the sky-tangent plane.
  let perpMajorSky = cross(los, majorSky);

  // Disk normal: line-of-sight tilted by (90° - inclination) toward
  // perpMajorSky.  At axisRatio=1 (face-on) the normal is exactly los;
  // at axisRatio→0 (edge-on) the normal lies in the sky-tangent plane.
  let cosI = axisRatio;
  let sinI = sqrt(max(0.0, 1.0 - cosI * cosI));
  let diskNormal = normalize(los * cosI + perpMajorSky * sinI);

  // In-plane axes: major lies in the sky-tangent plane (face-on it's
  // along the sky major axis; edge-on it's the same direction since
  // both axes still lie in the sky plane).  Minor is the cross-product
  // major × normal — guaranteed in-plane.
  let majorAxis = majorSky;
  let minorAxis = normalize(cross(diskNormal, majorAxis));

  // Quad corners in world space: centre + corner.x · major + corner.y · minor,
  // each scaled by the half-extent.
  let worldOffset = corner.x * majorAxis * halfWorld + corner.y * minorAxis * halfWorld;
  let worldPos = pos + worldOffset;

  var out: VsOut;
  out.clipPos = u.viewProj * vec4<f32>(worldPos, 1.0);
  out.uv = corner;
  out.colourIndex = instance.extras.x;
  out.crossfadeAlpha = instance.extras.y;
  return out;
}

// ── Fragment stage ─────────────────────────────────────────────────────
//
// Reads the disk-local uv (in [-1,1]² where r=1 is the impostor's
// apparent edge) and shades a two-component galaxy profile:
//
//   - Gaussian bulge (σ = 0.4): warm-tinted (R-shifted) inner core.
//   - Exponential disk (scale = 0.5): cool-tinted (B-shifted) halo.
//
// Both components share the colour-index ramp's hue (so SDSS u-g, GLADE
// B-J etc. continue to colour the galaxy), but the bulge mixes ~30%
// toward (1, 0.6, 0.4) [warm yellow-red, simulating older redder bulge
// stars] and the disk mixes ~30% toward (0.7, 0.85, 1.0) [cooler blue-
// white, simulating younger disk stars].  The mix amounts are fixed
// in v1; later iterations could drive them from per-row stellar-
// population proxies.
//
// Final alpha is the combined brightness × crossfadeAlpha so the
// impostor fades in cleanly across the 8-14 px transition band.

const BULGE_SIGMA = 0.4;
const DISK_SCALE = 0.5;
const BULGE_WEIGHT = 0.6;
const DISK_WEIGHT = 0.4;
const BULGE_TINT = vec3<f32>(1.0, 0.6, 0.4);   // warm shift
const DISK_TINT  = vec3<f32>(0.7, 0.85, 1.0);  // cool shift
const TINT_MIX   = 0.3;

// Same colour ramp the points pass uses — re-implementing here keeps
// the two passes visually consistent.  See points.wgsl for the
// derivation; copying instead of factoring out because WGSL lacks an
// import mechanism short of a proper preprocessor.
fn colourRamp(t: f32) -> vec3<f32> {
  // t ∈ [0, 2]: 0 = bluest, 1 = midpoint, 2 = reddest.
  let s = clamp(t * 0.5, 0.0, 1.0); // remap to [0, 1]
  let blue   = vec3<f32>(0.55, 0.75, 1.00);
  let yellow = vec3<f32>(1.00, 0.95, 0.75);
  let red    = vec3<f32>(1.00, 0.55, 0.40);
  // Two-stage piecewise linear: blue → yellow → red.
  if (s < 0.5) {
    return mix(blue, yellow, s * 2.0);
  }
  return mix(yellow, red, (s - 0.5) * 2.0);
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  let r = length(in.uv);
  if (r > 1.0) { discard; }

  let bulge = exp(-(r * r) / (2.0 * BULGE_SIGMA * BULGE_SIGMA));
  let disk  = exp(-r / DISK_SCALE);
  let intensity = bulge * BULGE_WEIGHT + disk * DISK_WEIGHT;

  // Colour: ramp base hue, then bias by which component dominates here.
  let base = colourRamp(in.colourIndex);
  // Each component contributes a fraction of the tint shift in
  // proportion to its share of the total brightness.
  let bulgeShare = bulge * BULGE_WEIGHT / max(intensity, 1e-4);
  let diskShare  = disk  * DISK_WEIGHT  / max(intensity, 1e-4);
  let tinted = base
    * mix(vec3<f32>(1.0), BULGE_TINT, bulgeShare * TINT_MIX)
    * mix(vec3<f32>(1.0), DISK_TINT,  diskShare * TINT_MIX);

  let alpha = intensity * in.crossfadeAlpha;
  // Premultiplied alpha — matches the project's blend mode (see
  // device.ts `alphaMode: 'premultiplied'`).
  return vec4<f32>(tinted * alpha, alpha);
}
