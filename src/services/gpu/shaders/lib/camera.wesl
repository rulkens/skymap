// lib/camera.wesl — shared camera uniform layout + projection helpers.
//
// Every renderer that touches world space ends up writing the same
// half-dozen lines: 'u.viewProj * vec4<f32>(p, 1.0)' to land in clip
// space, 'length(u.camPosWorld - p)' for an apparent-size factor, and
// so on. Centralising the uniform-struct prefix and the helper
// functions lets us:
//
//   1. Audit the camera math in one place — when something looks
//      foreshortened wrong, there is exactly one definition of
//      'worldToClip' to blame.
//   2. Reuse the same byte layout across renderers, so a future
//      "shared per-frame camera UBO bound at @group(2)" refactor only
//      has to touch the CPU-side uploader, not the WGSL.
//   3. Give human reviewers a hook: any new renderer should import
//      from here rather than rolling its own viewProj wiring.
//
// ## Why this is so MINIMAL
//
// The rejected alternative was a much wider CameraUniforms with
// separate 'view' + 'proj' matrices, plus 'kPerZ', 'dpr', 'timeSec',
// etc. The actual renderer Uniforms structs argue against it:
//
//   - None of the camera-consuming renderers uses 'view' or 'proj'
//     separately; all of them only need the combined 'viewProj'.
//   - 'kPerZ' and 'dpr' are not in any uniform struct.
//   - 'cameraPos' (under various spellings: 'camPosWorld',
//     'cameraPosWorld', 'camPos') lives at WILDLY different byte
//     offsets across renderers — points puts six other f32/u32
//     fields between 'viewport' and 'camPosWorld'; quads/texturedDisks
//     pad those slots out with explicit '_pad0/_pad1'. Forcing all
//     of them onto the same prefix would mean rewriting the
//     points uniform layout purely to satisfy a
//     shared struct, with no functional benefit. The guardrail
//     'fields used by only one renderer stay renderer-specific'
//     applies a fortiori when the placement of a field varies
//     between renderers.
//   - 'filaments' has no camera position at all — its quads only
//     need 'viewProj' for endpoint projection.
//
// What IS universal across the camera-consuming renderers (everything
// except 'toneMap', which is a fullscreen pass without world-space
// math) is the prefix:
//
//   offset 0:  mat4x4<f32> viewProj   (64 B)
//   offset 64: vec2<f32>   viewportPx (8 B)
//   offset 72: f32         _pad0      (4 B; reserves the 16-B-align
//   offset 76: f32         _pad1       slot used by every renderer
//                                       between 'viewport' and the
//                                       next vec3-aligned member).
//   total: 80 bytes.
//
// 'cameraPos' is therefore NOT in CameraUniforms; the helpers that
// need it ('worldEyeDepth', any future 'pxPerRad'-style scaling)
// take it as an explicit 'vec3<f32>' parameter so renderers can
// continue to put it wherever their own layout demands.
//
// ## Byte layout (canonical)
//
// Renderers extending CameraUniforms (e.g. 'struct Uniforms { cam:
// CameraUniforms, brightness: f32, ... }') get:
//
//   0..63:  viewProj
//   64..71: viewportPx
//   72..79: _pad0, _pad1
//   80..  : renderer-specific fields, naturally 16-B aligned.
//
// The two trailing pads are NOT decorative — they reserve the slots
// the existing renderers' Uniforms structs already use to round
// 'viewport + 8B' up to a vec3<f32> alignment boundary at offset 80.
// Without them, a renderer extending 'cam: CameraUniforms' with a
// vec3 next field would silently insert implicit padding that the
// CPU side might not match. Naming the bytes makes the JS-side
// upload obvious and grep-able.

struct CameraUniforms {
  viewProj:   mat4x4<f32>,
  viewportPx: vec2<f32>,
  _pad0:      f32,
  _pad1:      f32,
};

// ── worldToClip ─────────────────────────────────────────────────────
//
// The single most-repeated camera operation: take a world-space point
// and produce its homogeneous clip-space coordinate. Every vertex
// stage that places anything by world position calls this once
// (sometimes twice, e.g. filaments projects two endpoints; quads
// projects center + a 'celestial-north' epsilon offset).
//
// Why pass 'cam' rather than capture a free-standing 'u'? WESL has
// no global state — the helper module can't see the renderer's
// '@group(0) @binding(0) var<uniform> u' binding. Taking 'cam' as a
// parameter means the helper is portable to any renderer's binding
// site and to future refactors that put the camera UBO at a
// different group/binding.
//
// Equivalent inline form: 'u.cam.viewProj * vec4<f32>(p, 1.0)'.

fn worldToClip(cam: CameraUniforms, p: vec3<f32>) -> vec4<f32> {
  return cam.viewProj * vec4<f32>(p, 1.0);
}

// ── worldEyeDepth ───────────────────────────────────────────────────
//
// Linear distance from the camera to a world-space point — the
// natural "how far away is this galaxy?" scalar that drives
// apparent-size billboards, thumbnail eligibility, and depth-fade
// gates. Linear (not 1/w) because every consumer multiplies it by
// an angular size or feeds it into a smoothstep — both of which
// expect proportional, not perspective-warped, distances.
//
// Why does 'cam' NOT carry the camera position? See the module
// header — cameraPos placement differs across renderer Uniforms
// structs, so the canonical CameraUniforms struct excludes it. The
// caller passes its renderer-specific 'u.camPosWorld' (or whatever
// it spelled the field) as 'eyeWS' here.
//
// Edge case: if the camera is exactly at p, the returned distance is
// 0. The two known consumers (apparent-size + thumbnail gating)
// already 'max(d, 0.001)' before dividing, so we don't clamp here —
// callers that need it know better than this generic helper how
// small a floor they want.

fn worldEyeDepth(eyeWS: vec3<f32>, p: vec3<f32>) -> f32 {
  return length(eyeWS - p);
}

// ── cameraRayFromUv ─────────────────────────────────────────────────
//
// Reconstructs a per-fragment camera ray direction from a fullscreen
// pass's own uv (a 'FullscreenOut.uv' in [0,1], y-DOWN — fullscreenTri
// .wesl's own convention) plus the camera basis and horizontal-FOV
// params every renderer here packs as (tanHalfFov, aspect, lensShiftX).
// Promoted out of milkyWay/ismMap/ismMapPresent.wesl and
// orientationPresent.wesl, which both rebuilt this ray to intersect it
// with the disc plane (package::lib::util::rayPlaneY0) for their own
// log-polar resample.
//
// uv -> ndc: x is the ordinary [0,1]->[-1,1] flip; y is inverted a
// SECOND time (1 - uv.y*2) to undo the uv's own y-down convention and
// recover the y-up NDC the basis weights below expect — the same net
// transform fieldSplat/fragment.wesl's per-vertex 'input.ndc' already
// carries in, just derived from a uv instead of a varying.
//
// No 'eye' parameter: the ray direction alone doesn't need the camera
// position, and folding it in here would force every caller to thread
// an unused value through — callers that also need the ray ORIGIN read
// their own 'eye' uniform directly, same as before this was factored out.
fn cameraRayFromUv(
  uv: vec2<f32>,
  camRight: vec3<f32>,
  camUp: vec3<f32>,
  camFwd: vec3<f32>,
  tanHalfFov: f32,
  aspect: f32,
  shift: f32,
) -> vec3<f32> {
  let ndcX = uv.x * 2.0 - 1.0;
  let ndcY = 1.0 - uv.y * 2.0;
  return normalize(
    camRight * ((ndcX + shift) * tanHalfFov * aspect)
      + camUp * (ndcY * tanHalfFov)
      + camFwd,
  );
}
