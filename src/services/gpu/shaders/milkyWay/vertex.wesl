// milkyWay/vertex.wesl — view-aligned billboard vertex stage for the
// Milky Way impostor.
//
// The impostor is a single screen-aligned quad centred at the world
// origin (Earth/Sun position in skymap world coordinates). The vertex
// stage's job is to:
//
//   1. Build a view-aligned basis (right + up + lookDir) so the quad
//      always faces the camera — the user never sees its rectangular
//      edge.
//   2. Scale the quad corners by the Milky Way's physical half-extent
//      so the impostor's angular size on screen scales as
//      '2 * atan(halfExtent / cameraDistance)'. Full-screen when the
//      camera is right next to the origin, vanishing to a dot far away.
//   3. Project each corner through the shared 'worldToClip' helper.
//
// The actual procedural-galaxy rendering is the fragment stage's
// responsibility — see 'milkyWay/fragment.wesl'.
//
// ## Why the bindings are declared here, not in io.wesl
//
// WESL has no global state — '@group(N) @binding(M) var<uniform> X'
// is a module-local declaration that cannot be exported across
// modules. We re-declare 'u' here using the 'Uniforms' struct
// imported from 'milkyWay/io.wesl', so the layout numbers match
// fragment.wesl's identical declaration. WGSL accepts the same
// '@group/@binding' pair appearing in multiple compiled modules so
// long as the layout is identical; importing a single authoritative
// struct definition makes drift structurally impossible.

import package::milkyWay::io::Uniforms;
import package::milkyWay::io::VsOut;
import package::lib::camera::worldToClip;

@group(0) @binding(0) var<uniform> u: Uniforms;

// Six corners of a unit quad in [-1, 1]², triangle-list order.  The
// vertex stage scales them by the Milky Way's half-extent and orients
// them on a view-aligned billboard plane centred at the world origin
// — see the vs() doc-comment for the full derivation.
const CORNERS = array<vec2<f32>, 6>(
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0, -1.0),
  vec2<f32>( 1.0,  1.0),
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0,  1.0),
  vec2<f32>(-1.0,  1.0),
);

// ── Physical scale ──────────────────────────────────────────────────
//
// Milky Way disk D_25 ≈ 30 kpc.  MILKY_WAY_HALFEXTENT_MPC is half the
// side length of the impostor billboard quad — it bounds where any of
// the disk's emission can appear before being clipped by the quad
// edge. The fragment stage uses a different constant
// (MILKY_WAY_RADIUS_MPC) for its world↔shader-unit conversion; see
// fragment.wesl for the rationale.
//
// 0.120 Mpc ⇒ 240 kpc total quad span, matching the 4× padding
// convention used by every other galaxy ('sizeWorld = diameterKpc *
// 4 / 1000').
const MILKY_WAY_HALFEXTENT_MPC: f32 = 0.120;

@vertex
fn vs(@builtin(vertex_index) vid: u32) -> VsOut {
  let c = CORNERS[vid];

  // ── View-aligned billboard basis ──────────────────────────────────
  //
  // The impostor is centred at the world origin (the catalogue origin
  // = Earth/Sun position in skymap world space).  We orient the quad
  // perpendicular to the view direction so the user never sees its
  // rectangular edge, and size each corner offset by the Milky Way's
  // physical half-extent.  Result: the impostor's angular size on
  // screen scales as '2 * atan(halfExtent / cameraDistance)' — full
  // screen when the camera is right next to the origin, vanishing to
  // a dot when the camera is far away.  This is the 'right physical
  // size' the previous all-clip-space implementation lacked.
  //
  // Why not orient the quad in the galactic disk plane?  Two reasons.
  // First, viewing edge-on would collapse the quad to a zero-area
  // sliver and the bulge (which is a sphere, not a disk) would still
  // need to render — the view-aligned billboard sidesteps this.
  // Second, the fragment stage's volumetric raymarching naturally
  // produces a 3D-looking spiral from any vantage, so the orientation
  // of the BACKING quad doesn't affect the rendered look — only the
  // *synthetic camera* inside the shader does, and we drive that
  // separately from 'cameraPosWorld' in the fragment stage.
  let lookDir = normalize(-u.cameraPosWorld);
  // World-up reference for the cross-product basis.  This MUST match
  // the OrbitCamera's 'lookAt' up-vector convention or the
  // billboard's basis tilts relative to the camera's actual screen
  // axes — the user-visible failure mode was 'the bulge disappears
  // on one side when looking head-on to the disk', caused by the
  // billboard rotating around the view direction so its quad's
  // angular coverage didn't line up with the screen's rectangular
  // viewport.
  //
  // OrbitCamera ('computeViewProj' in 'orbitCamera.ts') uses world
  // +Y as the up reference for 'mat4.lookAt', with the orbit-
  // controls module clamping pitch to ±(π/2 − ε) to keep the lookAt
  // matrix non-degenerate.  We mirror that exactly: worldUp = +Y,
  // and the same pitch clamp upstream guarantees 'cross(lookDir,
  // +Y)' is non-degenerate so we never need to use the pole
  // fallback in practice.  The fallback is kept defensively for
  // the (currently impossible) case where pitch reaches the pole.
  let worldUp = vec3<f32>(0.0, 1.0, 0.0);
  let upDot = abs(dot(lookDir, worldUp));
  let upRef = select(worldUp, vec3<f32>(0.0, 0.0, 1.0), upDot > 0.999);
  let right = normalize(cross(lookDir, upRef));
  let up = cross(right, lookDir);

  // Build the world-space corner position.  Multiplied by the half-
  // extent so the quad spans 2 × halfExtent in world units (matching
  // the [-1, 1] range of the corner UV).
  let worldPos = (c.x * right + c.y * up) * MILKY_WAY_HALFEXTENT_MPC;

  var out: VsOut;
  out.clipPos = worldToClip(u.cam, worldPos);
  out.uv = c;
  out.worldPos = worldPos;
  return out;
}
