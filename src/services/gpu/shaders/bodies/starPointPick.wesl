// starPointPick.wesl — instanced pick billboard for the scene-star POINT
// partition (the sub-pixel seeded famous / neighbourhood stars).
//
// The pick twin of 'bodies/starPoints/vertex.wesl'. The visual stage sizes each
// dot from apparent flux and paints a soft Gaussian; the pick stage needs only a
// clickable footprint at the star's TRUE screen position, so it drops all the
// photometry and expands a fixed 18 px billboard, writing the star's packed
// identity where the round dot covers a pixel.
//
// ## Two vertex entries, one footprint + fragment: 'vs' and 'vsGlint'
//
// The module carries TWO vertex entries that share the identical billboard
// expansion and the one 'fsPick' fragment, differing ONLY in how they set depth:
//
//   - 'vs'      — the scene / famous stars. It MIN-CLAMPS true depth onto the
//                 scene-star band, so a within-far star keeps its true depth and
//                 the class sorts physically among itself while still beating every
//                 survey star and the backdrop.
//   - 'vsGlint' — the sub-pixel solar-system body glints (planets, moons, and the
//                 Earth glint stamp). It FORCES depth onto a per-instance glint
//                 CLASS band (see 'lib/pickDepthBands'): a glint is a UI affordance,
//                 not geometry, so a moon a micro-Mpc nearer than its planet must
//                 NOT steal the click. Each glint carries its priority class (0
//                 earth, 1 planet, 2 moon) as instance data and the class selects
//                 its own well-separated band, so earth-over-planet-over-moon is an
//                 unconditional depth win — no draw order, no exact-depth tie.
//
// bodyPickRenderer compiles this module into its OWN GPUShaderModule and builds
// one points pipeline per entry (never shared with the sphere pipeline — the
// 'auto'-layout trap; the two point pipelines share ONE explicit layout, so their
// bind groups are interchangeable).
//
// ## Why a fixed footprint, not the visual flux ramp
//
// A scene star bright enough to fill more than a few pixels has RESOLVED into a
// sphere and is picked through the 'drawSphere' path instead — the point
// partition is by construction the sub-pixel stars ('partitionStarsByResolution').
// So a fixed clickable floor IS the whole footprint here; there is no larger
// visual dot to match, unlike the survey star pick which clamps 'max(visual,
// floor)'.
//
// ## Why a generous 18 px footprint, larger than the survey clamp
//
// These are the <=25 seeded scene stars — sparse, named, and drawn with a label
// that invites a click. A too-small hit area makes those labelled targets feel
// unclickable, so their footprint is deliberately LARGER than the survey star
// pick's minimal clamp. The survey path (starCatalog/vertex.wesl) keeps its
// 3.5 px radius because dense field stars would occlude each other's picks if
// each grabbed a wide footprint; here the roster is tiny and well separated, so
// a 9 px radius (18 px diameter) grabs comfortably without any collision risk.
//
// ## The identity is written RAW
//
// Each instance's 'packedId' arrives fully packed from the CPU
// ('packSelection(sourceCode, seedIndex + PICK_SENTINEL_OFFSET)'). It rides an
// instance attribute (NOT '@builtin(instance_index)', which shifts as bodies
// enter/leave the resolved set) and the fragment writes it unchanged.
//
// ## Precision — camera-relative inputs
//
// 'posRelCamMpc' arrives already rebased into the CAMERA-RELATIVE frame (the eye
// subtracted, the eye offset folded into 'vp' via 'rebaseViewProj', both in
// f64), exactly as the visual starPoints stage receives it — so the raw
// parsec-scale anchor and the view translation never cancel catastrophically in
// f32. See starPointRenderer.ts's precision note.
//
// ## Attribute layout (stepMode 'instance')
//
// The two entries take DIFFERENT instance strides, supplied by their two
// pipelines (bodyPickRenderer builds one vertex-buffer layout each):
//
//   'vs'      — stride 16 bytes:
//     @location(0) posRelCamMpc: vec3<f32>  — camera-relative anchor, offset 0.
//     @location(1) packedId:     u32        — fully-packed pick id, offset 12.
//   'vsGlint' — stride 20 bytes: the same two, plus
//     @location(2) bandClass:    u32        — glint priority class, offset 16
//                                             (0 earth, 1 planet, 2 moon).

import package::lib::camera::CameraUniforms;
import package::lib::camera::worldToClip;
import package::lib::billboard::quadCorner;
import package::lib::billboard::expandBillboardScreen;
import package::lib::pickDepthBands::PICK_BAND_SCENE_STAR_EPS;
import package::lib::pickDepthBands::PICK_BAND_EARTH_EPS;
import package::lib::pickDepthBands::PICK_BAND_PLANET_EPS;
import package::lib::pickDepthBands::PICK_BAND_MOON_EPS;

@group(0) @binding(0) var<uniform> u: CameraUniforms;

// 18 px clickable footprint (9 px radius) — the WHOLE footprint for these <=25
// labelled scene stars, sized generously so a label's click invitation lands
// (see module header). Deliberately larger than the survey pick's minimal clamp.
const FAMOUS_STAR_PICK_RADIUS_PX: f32 = 9.0;

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  // Quad corner in [-1, +1]^2 — the fragment's distance-from-centre.
  @location(0) uv: vec2<f32>,
  // Fully-packed pick id, flat across the quad (integer varyings must be flat).
  @location(1) @interpolate(flat) packedId: u32,
};

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  @location(0) posRelCamMpc: vec3<f32>,
  @location(1) packedId: u32,
) -> VSOut {
  let center = worldToClip(u, posRelCamMpc);
  let corner = quadCorner(vi);
  let offset = expandBillboardScreen(u, center, FAMOUS_STAR_PICK_RADIUS_PX, corner);

  var out: VSOut;
  out.clip = center + vec4<f32>(offset, 0.0, 0.0);

  // Clamp true depth onto the SCENE-STAR band (header 'lib/pickDepthBands'). A
  // within-far scene star keeps its TRUE depth (min leaves it untouched), so
  // scene stars sort physically among themselves and sit in front of every
  // survey star and the backdrop. A BEYOND-far scene star (past the adaptive
  // foreground far plane on a deep descent) lands exactly on the scene band
  // 'z = w * (1 - PICK_BAND_SCENE_STAR_EPS)' — still the SHALLOWEST band, so it
  // beats every survey star while staying pickable instead of being clipped
  // away. This is the shared scene-star clamp value the survey pick stage names
  // as its front band too, single-sourced so the two can never diverge. This
  // 'vs' entry is scene-star ONLY; glints (planets, moons, the Earth stamp) use
  // 'vsGlint' below, which forces its own shallower band instead of min-clamping
  // true depth — see that entry's doc block for why.
  out.clip.z = min(out.clip.z, out.clip.w * (1.0 - PICK_BAND_SCENE_STAR_EPS));

  out.uv = corner;
  out.packedId = packedId;
  return out;
}

@vertex
fn vsGlint(
  @builtin(vertex_index) vi: u32,
  @location(0) posRelCamMpc: vec3<f32>,
  @location(1) packedId: u32,
  @location(2) bandClass: u32,
) -> VSOut {
  // Same billboard expansion as 'vs' (identical footprint at the true screen
  // position); ONLY the depth handling differs.
  let center = worldToClip(u, posRelCamMpc);
  let corner = quadCorner(vi);
  let offset = expandBillboardScreen(u, center, FAMOUS_STAR_PICK_RADIUS_PX, corner);

  var out: VSOut;
  out.clip = center + vec4<f32>(offset, 0.0, 0.0);

  // FORCE the per-instance glint CLASS band (header 'lib/pickDepthBands'), NOT the
  // min-clamp 'vs' uses. Sub-pixel glints are UI affordances, not geometry, and
  // importance-not-nearness is the whole point: a moon 1e-6 Mpc nearer than its
  // planet must not steal the click. Each glint carries its class (0 earth, 1
  // planet, 2 moon) as instance data, and the class selects its OWN band here.
  // The three bands are separated by 5e-5 in z/w (hundreds of f32-resolvable steps
  // near 1.0), so earth-over-planet-over-moon is an UNCONDITIONAL depth win — no
  // draw order, no exact-depth tie to break (the older single-band design leaned
  // on draw order and a ulp of rasterizer 'z / w' rounding defeated it). Larger
  // eps = smaller z/w = wins under 'depthCompare: less', so EARTH (largest eps) is
  // shallowest and out-picks a planet, which out-picks a moon; all three out-pick
  // every scene star, survey star, and the backdrop. A resolved sphere nearer than
  // ~orbitDistance/4 keeps a true z/w below these bands and correctly wins — a
  // planet's own disk out-picks its glint stamp.
  var eps: f32 = PICK_BAND_MOON_EPS;
  if (bandClass == 0u) {
    eps = PICK_BAND_EARTH_EPS;
  } else if (bandClass == 1u) {
    eps = PICK_BAND_PLANET_EPS;
  }
  out.clip.z = out.clip.w * (1.0 - eps);

  out.uv = corner;
  out.packedId = packedId;
  return out;
}

@fragment
fn fsPick(in: VSOut) -> @location(0) vec4<u32> {
  // Round dot: discard fragments outside the inscribed unit circle so the
  // clickable shape matches a round star, not the square quad.
  if (dot(in.uv, in.uv) > 1.0) { discard; }
  // r-channel carries the identity; g/b/a stay 0 (only r is read back).
  return vec4<u32>(in.packedId, 0u, 0u, 0u);
}
