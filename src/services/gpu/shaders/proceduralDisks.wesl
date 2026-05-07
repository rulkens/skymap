// proceduralDisks.wgsl — 3D-oriented procedural galaxy impostors.
//
// Sibling pass to 'disks.wgsl' (texture-based disks) and 'points.wgsl'
// (screen-aligned billboards).  Renders every galaxy whose apparent
// size exceeds 8 px (with a crossfade up to 14 px) as a 3D-oriented
// quad shaded with a two-component brightness profile (Gaussian bulge
// + exponential disk).  No texture sampling — the fragment stage
// generates the shape entirely from per-fragment math.
//
// The vertex stage is structurally identical to disks.wgsl: we
// construct an in-plane orthonormal basis from 'axisRatio' (which
// encodes inclination via 'cos(i) = axisRatio' for thin disks) and
// 'positionAngleDeg' (east-of-north major-axis direction on the sky),
// then offset the corner vertices into world space.  See disks.wgsl
// for the full derivation; we trust that derivation here and re-use
// the math.

// CameraUniforms covers the canonical 80-byte prefix shared by every
// world-space renderer (viewProj + viewportPx + 8B pad).  Like the
// 'disks' sibling, this vertex stage is intentionally camera-independent
// — the disk's 3D orientation is an intrinsic galaxy property, so the
// only camera input the shader consumes is 'cam.viewProj' via
// 'worldToClip'.  We deliberately don't import 'worldToNdc' or
// 'worldEyeDepth': they're unused here, and importing unused names
// would just add noise for future readers grepping for camera-helper
// usage.
import package::lib::camera::CameraUniforms;
import package::lib::camera::worldToClip;
// Shared unit-quad helper from 'lib/billboard.wesl' — replaces the
// inline 'CORNERS' const that used to live below. The orientation-
// aligned disk-plane basis (PA + inclination → 'majorAxis' /
// 'minorAxis' in 3D world space) stays renderer-specific; only the
// vertex-index → corner lookup is shared. We don't import 'quadUv'
// here: this pass uses the raw [-1, +1]² corner directly as the
// fragment's radial coordinate (see 'out.uv = corner' below + the
// 'length(in.uv)' read in 'fs'), so the [0, 1]² remap that 'quadUv'
// performs would be wrong. See the docblock at the top of
// 'lib/billboard.wesl' for why the orientation math is intentionally
// NOT pulled into this lib.
import package::lib::billboard::quadCorner;
// Disk-plane axis math (PA + inclination → world-space major/minor basis)
// is shared with 'disks.wesl' via 'lib/orientation.wesl'. The inline
// derivation that used to live in this file's vs() body — the
// los/north/east/major/minor chain plus the inclination tilt of the
// minor axis out of the sky plane — is now the lib's 'diskAxes' fn,
// byte-equivalent for proceduralDisks since the lib standardised on
// the tight 'northLen < 1e-4' post-projection pole-fallback that
// proceduralDisks already used. See 'lib/orientation.wesl' for the
// camera-independence invariant + the pole-degeneracy discussion.
import package::lib::orientation::DiskAxes;
import package::lib::orientation::diskAxes;
import package::lib::colorIndex::ramp;
// Shared fragment-stage mask shapes — see 'lib/masks.wesl' for the
// rationale (three smoothstep patterns recurred across four shaders,
// naming the shapes makes the intent visible at the call site). The
// previous inline form here was 'smoothstep(1.0, 0.6, r)' which
// relies on smoothstep's symmetry under edge inversion to produce
// the high-inside-low-outside shape; 'circularMask(r, 0.6, 1.0)'
// produces the same output and makes the inner/outer ordering
// explicit.
import package::lib::masks::circularMask;

struct Uniforms {
  cam: CameraUniforms,
  // 'camPosWorld' + 'pxPerRad' are preserved in the layout for ABI
  // continuity with the JS upload path (proceduralDiskRenderer.ts still
  // writes them at offsets 80/92), but the world-fixed disk math
  // doesn't read either — orientation derives from the line of sight
  // 'normalize(pos)' (Earth → galaxy), not the camera, and the
  // procedural shader has no apparent-size scaling that would consult
  // 'pxPerRad'.  Same intentional ABI-preservation pattern as
  // disks.wesl line 65-74.
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

@vertex
fn vs(@builtin(vertex_index) vid: u32, instance: InstanceIn) -> VsOut {
  // Unit-square corner offset in [-1, +1]² for this triangle-list
  // vertex. Pulled from 'lib/billboard::quadCorner' so the (BL, BR,
  // TR, BL, TR, TL) ordering is shared across all four billboard
  // renderers — see the lib's docblock for the corner-ordering
  // discussion. The corner here is in the disk's LOCAL 2D frame; the
  // 3D placement happens via the (majorAxis, minorAxis) basis below,
  // and 'out.uv = corner' forwards it unchanged so the fragment can
  // use 'length(in.uv)' as the radial distance for the brightness
  // profile.
  let corner = quadCorner(vid);

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
  // Half the full-extent value in posSize.w to match disks.wgsl line 104.
  // 'posSize.w' is the FULL quad extent in Mpc (set at the emission site
  // in thumbnailSubsystem.ts to '(diameterKpc/1000) * 4', the same
  // multiplier the points pass uses for GALAXY_RADIUS_MPC).  Each
  // corner sits at ±halfWorld * basis, so the rendered quad spans
  // 2*halfWorld = posSize.w world units total — agreeing with both the
  // textured-thumbnail disk (which uses identical posSize.w) and the
  // points-pass billboard (which uses the same multiplier directly).
  let halfWorld = instance.posSize.w * 0.5;
  // Floor at 0.05 to avoid degenerate-edge-on disks collapsing the quad to a
  // 1D line in the vertex stage; matches the disks.wgsl convention.
  let axisRatio = max(instance.orientation.x, 0.05);
  let paRad = instance.orientation.y * 3.14159265 / 180.0;

  // ── Disk-plane basis (PA + inclination → world-space major / minor) ─
  //
  // The full derivation — line-of-sight from Earth-at-origin, sky-tangent
  // (north, east) frame with pole fallback, PA-east-of-north rotation,
  // and inclination tilt of the minor axis out of the sky plane — lives
  // in 'lib/orientation.wesl'. See its docblock for the camera-
  // independence invariant and the tight post-projection 'northLen <
  // 1e-4' pole-degeneracy fallback that this renderer historically used
  // and the lib now standardises on. 'axisRatio' is clamped at the call
  // site (above) BEFORE we feed it through as cosI, because the lib
  // intentionally doesn't re-clamp.
  let cosI = axisRatio;
  let sinI = sqrt(max(0.0, 1.0 - cosI * cosI));
  let axes = diskAxes(pos, paRad, cosI, sinI);
  let majorAxis = axes.major;
  let minorAxis = axes.minor;

  // Quad corners in world space: centre + corner.x · major + corner.y · minor,
  // each scaled by the half-extent.
  let worldOffset = corner.x * majorAxis * halfWorld + corner.y * minorAxis * halfWorld;
  let worldPos = pos + worldOffset;

  var out: VsOut;
  out.clipPos = worldToClip(u.cam, worldPos);
  out.uv = corner;
  out.colourIndex = instance.extras.x;
  out.crossfadeAlpha = instance.extras.y;
  return out;
}

// ── Fragment stage ─────────────────────────────────────────────────────
//
// Reads the disk-local uv (in [-1,1]² where r=1 is the impostor's
// apparent edge) and shades a two-component galaxy brightness profile:
//
//   - Gaussian bulge (σ = 0.4): bright inner core.
//   - Exponential disk (scale = 0.5): softer halo.
//
// Hue comes entirely from the per-galaxy colour-index ramp — the same
// ramp the points pass uses, so a galaxy's procedural-disk colour
// matches its companion point exactly.  Earlier versions added warm-
// bulge / cool-disk tint shifts on top of the ramp colour; that made
// the procedural disk visibly diverge from the points pass (warmer at
// the centre, cooler at the rim) so it's been removed.  Only the
// brightness profile remains.
//
// Final alpha is the combined brightness × crossfadeAlpha so the
// impostor fades in cleanly across the 8-14 px transition band.

const BULGE_SIGMA = 0.4;
const DISK_SCALE = 0.5;
const BULGE_WEIGHT = 0.6;
const DISK_WEIGHT = 0.4;

// 'ramp(t)' lives in 'lib/colorIndex.wesl' — imported at the top of
// this file. Sharing the function with the points pass guarantees
// procedural-disk colour matches points colour exactly at any
// colour-index value, so the disk impostor fade-in doesn't introduce
// a visible cross-LOD hue shift.

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  let r = length(in.uv);
  if (r > 1.0) { discard; }

  let bulge = exp(-(r * r) / (2.0 * BULGE_SIGMA * BULGE_SIGMA));
  let disk  = exp(-r / DISK_SCALE);
  let intensity = bulge * BULGE_WEIGHT + disk * DISK_WEIGHT;

  // Colour: ramp hue only, no per-component tint shifts.  See the
  // fragment-stage header comment above for why the warm-bulge / cool-
  // disk tints were removed (they made this pass visibly diverge from
  // the points pass at the crossfade boundary).
  let base = ramp(in.colourIndex);
  let tinted = base;

  // Soft edge fade.  We're outputting LINEAR colour into an rgba16float
  // HDR target; the tone-map pass converts to sRGB later (see
  // toneMap.wgsl).  The disk's exponential decay leaves a residual
  // 'exp(-2) ≈ 0.135' at r = 1.0 in LINEAR space, which the gamma curve
  // brightens to ~42% display brightness — that's the hard edge the
  // user sees right before the discard.
  //
  // Apply a smoothstep edge fade from r = 0.6 (full disk) to r = 1.0
  // (zero alpha), and SQUARE it to compensate for the ~2.2-power gamma:
  // a value 'x' in linear space becomes 'x^(1/2.2) ≈ x^0.45' in display.
  // To get display brightness that fades roughly linearly with r, the
  // linear intensity must fade as '(1-r')^2.2 ≈ (1-r')^2' (where r' is
  // the smoothstep parameter).  Squaring 'edgeFade' yields exactly that
  // '(smoothed)^2' shape — perceptually smooth in display space.
  //
  // We multiply the alpha (not the rgb separately) because we use
  // premultiplied alpha additive blending; alpha is the brightness
  // gate, and fading it to 0 at r = 1.0 is what removes the hard edge.
  let edgeFade = circularMask(r, 0.6, 1.0);
  let edgeFadeLinear = edgeFade * edgeFade;
  let alpha = intensity * in.crossfadeAlpha * edgeFadeLinear;
  // Premultiplied alpha — matches the project's blend mode (see
  // device.ts 'alphaMode: 'premultiplied'').
  return vec4<f32>(tinted * alpha, alpha);
}
