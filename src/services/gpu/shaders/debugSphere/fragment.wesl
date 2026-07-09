// debugSphere/fragment.wesl — fragment stage for the debug-sphere overlay.
//
// Produces a simple lat-long-gridded shading so the sphere is
// immediately legible: roundness, jitter, and orientation are all
// visible without needing a texture or a light source.
//
// ## Shading model
//
// Two layers, both driven by the unit-sphere surface normal (== local
// position for a unit sphere):
//
//   1. Diffuse normal shade: brightens the hemisphere facing a fixed
//      view-aligned 'sun' direction, darkens the opposite hemisphere.
//      This gives the sphere a 3-D appearance with no geometry overhead.
//
//   2. Lat-long grid: a thin bright grid at every 30 degrees of latitude
//      and longitude.  The grid makes it trivial to eyeball whether the
//      sphere's orientation matches the body's pole, and whether
//      jitter (temporal or subpixel) is causing the mesh to shimmer.
//
// ## Blend target
//
// Output @location(0) writes to the rgba16float foreground colour target
// (see 'foregroundComposite.ts').  The foreground composite pass uses
// straight-alpha OVER blending: the hardware multiplies the emitted
// colour by 'src-alpha' itself, so we must emit STRAIGHT colour (not
// premultiplied) with alpha=1 for fully opaque fragments.
//
// ## Why no separate io.wesl?
//
// The VSOut struct is defined here in the fragment module rather than
// a shared 'io.wesl' because the debug sphere's interface is trivial
// (one vec3 interpolant) and is not shared with any other shader.
// Adding an 'io.wesl' is the right call only when two or more modules
// need to share the same struct definition -- matching the convention
// in 'points/io.wesl' and 'foregroundComposite/io.wesl', both of which
// are shared by two compilation units.

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) localPos: vec3<f32>,
};

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // The unit-sphere local position is identical to the outward surface
  // normal.  Normalise after interpolation to correct any sub-texel
  // drift introduced by the rasteriser's perspective-correct interpolant.
  let N = normalize(in.localPos);

  // ── Diffuse shade ────────────────────────────────────────────────────
  //
  // A fixed 'sun' direction in view-aligned upper-left space gives the
  // sphere a readable highlight without requiring a light-source uniform.
  // 'max(dot, 0)' clamps the dark hemisphere to zero; adding a small
  // ambient term (0.15) prevents the shadow side from going pure black
  // so the sphere silhouette stays visible in all orientations.
  let sun = normalize(vec3<f32>(0.6, 0.8, 0.4));
  let diffuse = max(dot(N, sun), 0.0);
  let shade = 0.15 + 0.85 * diffuse;

  // Base colour: a neutral blue-grey that reads well against the black
  // HDR background.  The debug sphere is intentionally desaturated so it
  // does not compete visually with the galaxy point cloud.
  let baseColour = vec3<f32>(0.4, 0.55, 0.75) * shade;

  // ── Lat-long grid ────────────────────────────────────────────────────
  //
  // Convert the surface normal to spherical coordinates and draw a grid
  // line every 30 degrees (pi/6 radians).  'fract(angle / step)' maps
  // each cell to [0, 1]; proximity to 0 or 1 signals a grid boundary.
  // We use 'abs(fract(x) - 0.5) < halfWidth' to centre the test at the
  // boundary and avoid a discontinuity at the wrap point.
  //
  // 'atan2' is available in WGSL as 'atan2(y, x)'.
  let lat = asin(clamp(N.y, -1.0, 1.0));         // [-pi/2, +pi/2]
  let lon = atan2(N.z, N.x);                      // [-pi,   +pi]

  let GRID_STEP = 3.14159265 / 6.0;               // 30 degrees
  let HALF_WIDTH = 0.04;                           // fraction of a cell

  let latCell = fract(lat / GRID_STEP);
  let lonCell = fract(lon / GRID_STEP);
  let onLatLine = abs(latCell - 0.5) > (0.5 - HALF_WIDTH);
  let onLonLine = abs(lonCell - 0.5) > (0.5 - HALF_WIDTH);
  let onGrid = onLatLine || onLonLine;

  // Grid lines are brighter than the base colour so they remain visible
  // even on the dark hemisphere.
  let gridColour = vec3<f32>(0.85, 0.9, 1.0);
  let colour = select(baseColour, mix(baseColour, gridColour, 0.7), onGrid);

  // Emit straight alpha=1 -- the foreground composite's 'src-alpha' blend
  // factor multiplies by this, giving an opaque result with no double-
  // multiplication artefact.
  return vec4<f32>(colour, 1.0);
}
