// quads.wesl — billboard galaxy thumbnails sampled from a single atlas.
//
// Run after the existing point pass.  Each instance is one textured
// quad whose world-space center matches a galaxy and whose size is
// computed from the engine's apparent-size threshold logic.  We bind
// the atlas texture + sampler in group(0) so the engine can swap the
// bind group cheaply when more thumbnails arrive.

// Shared CameraUniforms prefix + projection helpers. See
// 'lib/camera.wesl' for the canonical 80-byte layout (viewProj +
// viewportPx + 8B reserved pad). quads needs 'worldToClip' for both
// the galaxy center AND the celestial-north EPS offset used to
// orient the billboard basis; it does NOT use 'worldEyeDepth'
// because the per-quad distance calculation is hand-coded inline
// (see 'distanceMpc' below) — pulling in the helper would just rename
// 'length(toGalaxy)' without changing the math.
import package::lib::camera::CameraUniforms;
import package::lib::camera::worldToClip;
// Shared unit-quad helpers from 'lib/billboard.wesl' — replace the
// inline 'CORNERS' const + '(corner + 1) * 0.5' UV remap that used to
// live below. The view-aligned celestial-north basis math stays
// renderer-specific (see 'NORTH_WORLD' / 'upClip' below); only the
// vertex-index → corner / UV lookups are shared.
import package::lib::billboard::quadCorner;
import package::lib::billboard::quadUv;
// Shared fragment-stage mask shapes — see 'lib/masks.wesl' for the
// rationale (three smoothstep patterns recurred across four shaders,
// naming the shapes makes the intent visible at the call site).
import package::lib::masks::circularMask;
import package::lib::masks::lumAlpha;

// Renderer-specific Uniforms struct.
//
// The first 80 bytes are the shared 'CameraUniforms' prefix
// (viewProj at offset 0, viewportPx at offset 64, two reserved-pad
// f32s at 72/76). The next 16 bytes carry this renderer's two
// camera-derived but renderer-specific fields: 'camPosWorld' (a
// vec3<f32> needing 16-B alignment, which offset 80 already
// provides) and 'pxPerRad' which fits in the trailing slot of
// camPosWorld's 16-B vec4 quantum.
//
// Why are camPosWorld + pxPerRad NOT in CameraUniforms?  See the
// header in 'lib/camera.wesl' — cameraPos lives at wildly different
// byte offsets across the points / milkyWayImpostor / quads / disks
// renderers, so it stays renderer-specific. quads happens to put it
// directly after the shared prefix, but a future shared per-frame
// camera UBO refactor will keep that the right shape.
//
// 'camPosWorld' + 'pxPerRad' were added when the original
// "project-a-unit-X-offset" billboard sizing turned out to depend on
// camera orientation (orbiting a galaxy made the quad visibly shrink
// or grow as the world-X axis rotated relative to the view direction).
// The replacement computes each quad's apparent angular radius from
// 'length(instance.posSize.xyz - camPosWorld)' and converts to screen
// pixels via 'pxPerRad = viewport.y / (2 · tan(fovY / 2))'.  Identical
// approach to points.wgsl — see that file for the derivation.
//
// Total uniform size: 96 bytes (unchanged from before the
// CameraUniforms adoption — the shared prefix exactly overlays the
// previous 'viewProj + viewport + _pad0 + _pad1' region byte-for-
// byte, so the CPU-side uploader's f32 indices do not move).
struct Uniforms {
  cam: CameraUniforms,
  camPosWorld: vec3<f32>,  // offset 80
  pxPerRad: f32,           // offset 92
};

// Per-instance attributes.  Three vec4s — first packs (xyz, sizeWorld),
// second is the uv rect, third carries the per-frame 'fadeAlpha'
// multiplier produced by the engine (distance fade × load fade).  All
// naturally 16-byte aligned.  The remaining three components of
// 'extras' are reserved padding for future per-instance flags.
struct InstanceIn {
  @location(0) posSize: vec4<f32>,
  @location(1) uvRect:  vec4<f32>,
  @location(2) extras:  vec4<f32>,
};

struct VsOut {
  @builtin(position) clipPos:   vec4<f32>,
  // UV inside the atlas — used to sample the bitmap.  Maps the slot's
  // sub-rectangle of the 2048×2048 atlas.
  @location(0)       atlasUv:   vec2<f32>,
  // UV inside the corner-local [0, 1]² unit square — used to compute
  // the radial alpha mask in 'fs'.  Independent of atlasUv because the
  // atlas slot might not occupy the full corner range when slot UV
  // rectangles get clamped or padded.  Threading both lets us decouple
  // "which texel to sample" from "where am I in the quad shape".
  @location(1)       cornerUv:  vec2<f32>,
  // Per-instance fade multiplier in [0, 1].  Constant across all six
  // vertices of one instance, so flat interpolation would be cheaper
  // — but a single forwarded float costs nothing either way and we
  // can re-use the smooth interpolation slot for the load fade if it
  // ever needs to vary across the quad.
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
  // discussion.
  let corner = quadCorner(vid);

  // Project the world-space center first.  We then offset the corner in
  // clip space by a fixed pixel half-extent.  Historically this was done
  // along the screen-X / screen-Y axes (camera-locked billboards), but
  // that decoupled the texture's "north-up" content from celestial
  // north — the moment the user rolled the camera the thumbnails stayed
  // stuck to the screen while the points-pass elliptical mask (which
  // rotates by the sky position-angle) drifted away from the texture's
  // dust-lane / disk orientation.  We now build the billboard basis from
  // the projected celestial-north direction at each galaxy's screen
  // position so the texture's north tracks the world's celestial north.
  let centerClip = worldToClip(u.cam, instance.posSize.xyz);

  // ── ANGULAR-SIZE → PIXEL HALF-EXTENT ─────────────────────────────────────
  //
  // The previous implementation tried to size the quad by projecting a
  // 1-Mpc-along-world-X offset point and measuring the clip-space delta —
  // which is correct only when world-X is roughly perpendicular to the
  // view direction.  As the camera orbited a galaxy, world-X rotated
  // toward / away from the view axis and the projected length expanded
  // and contracted, making the quad apparently shrink and grow.  Bug
  // fixed by computing the on-screen radius directly from the world-space
  // distance and the camera's pixel-per-radian factor (independent of
  // camera orientation).
  //
  //   distanceMpc       = ‖ instance.xyz − camPosWorld ‖
  //   angularRadius_rad = (sizeWorldMpc * 0.5) / distanceMpc
  //   halfPixels        = angularRadius_rad · pxPerRad
  //
  // We guard distanceMpc against 0 (camera parked exactly on a galaxy
  // center, possible during focus-tween) so we don't divide-by-zero.
  let toGalaxy   = instance.posSize.xyz - u.camPosWorld;
  let distanceMpc = max(length(toGalaxy), 0.001);
  let halfWorld   = instance.posSize.w * 0.5;
  let halfPixels  = (halfWorld / distanceMpc) * u.pxPerRad;

  // ── WORLD-ORIENTED BILLBOARD BASIS ───────────────────────────────────────
  //
  // Build the local +Y axis of the billboard from the projected celestial
  // north direction at this galaxy's screen position.  Why?  In skymap's
  // world convention 'raDecZToCartesian', +Z is the celestial north pole
  // (Dec = +90°), so projecting 'pos + EPS · (0,0,1)' and subtracting the
  // projected center gives the screen-space direction "toward sky north"
  // at the galaxy.  Using that as the billboard's local +Y means:
  //
  //   - The texture's content (which is north-up by SDSS / DSS source
  //     convention) stays aligned with sky north as the camera rolls.
  //   - The points-pass elliptical mask (which rotates by '-PA', with PA
  //     measured east-of-north) ends up consistent with the texture's
  //     apparent orientation — both are anchored to projected north.
  //
  // We work in *pixel* space (not raw NDC) so the basis is orthonormal in
  // the units we actually paint with — NDC distances are aspect-ratio
  // distorted, which would let the basis become non-perpendicular at
  // non-square viewports and slightly shear the texture.
  //
  // Edge case: at the celestial poles the world +Z direction projects to
  // (or very near) the same screen point as the galaxy center, so
  // 'upPx ≈ 0' and 'normalize' would blow up.  We fall back to the
  // original screen-axis basis in that degenerate case.  This is the only
  // place the old behaviour leaks through — and only for galaxies whose
  // line of sight is essentially parallel to the celestial north axis.
  let NORTH_WORLD = vec3<f32>(0.0, 0.0, 1.0);
  let EPS = 0.001;
  let upClip = worldToClip(u.cam, instance.posSize.xyz + NORTH_WORLD * EPS);
  let centerNdc = centerClip.xy / centerClip.w;
  let upNdc = upClip.xy / upClip.w;
  let upNdcDelta = upNdc - centerNdc;
  let upPx = vec2<f32>(upNdcDelta.x * u.cam.viewportPx.x * 0.5, upNdcDelta.y * u.cam.viewportPx.y * 0.5);

  // Pole-degenerate fallback: when the projected-north delta vanishes,
  // use screen-X / screen-Y so the quad still renders (just unoriented).
  let upPxLen = length(upPx);
  let useFallback = upPxLen < 1e-6;
  let upPxNorm = select(upPx / upPxLen, vec2<f32>(0.0, 1.0), useFallback);
  // +X (right) is a +90° rotation of +Y (up) in screen space.  Image-space
  // y points down on screen, so the in-image right-of-north direction is
  // (upY, -upX) — same handedness as the points-pass UV convention so the
  // '-PA' rotation in points.wgsl agrees with the quad's local +Y meaning
  // "celestial north".
  let rightPxNorm = vec2<f32>(upPxNorm.y, -upPxNorm.x);

  // Apply the corner offset along the celestial-north basis instead of
  // screen X / Y.
  let offsetPx = corner.x * halfPixels * rightPxNorm + corner.y * halfPixels * upPxNorm;

  // Convert pixels to clip-space half-extent.  As in points.wgsl, we
  // multiply by 'centerClip.w' to cancel the perspective divide so the
  // billboard ends up exactly 'halfPixels' on screen regardless of
  // depth.
  let offsetClip = vec2<f32>(
    offsetPx.x * 2.0 / u.cam.viewportPx.x,
    offsetPx.y * 2.0 / u.cam.viewportPx.y,
  ) * centerClip.w;

  var out: VsOut;
  out.clipPos = vec4<f32>(
    centerClip.xy + offsetClip,
    centerClip.z,
    centerClip.w,
  );

  // UV: 'quadUv' returns the unit-square corner remapped to [0, 1]²
  // (same vertex-index ordering as 'quadCorner' above). We then mix
  // into the slot's atlas rect.  Flip V so the texture isn't upside
  // down — 'flipY: false' on the atlas upload preserves the natural
  // ImageBitmap orientation (top-down), and our UV convention here
  // puts v=0 at the top of the atlas.
  let cornerUv = quadUv(vid);
  let uvLocal = vec2<f32>(cornerUv.x, 1.0 - cornerUv.y);
  out.atlasUv = mix(instance.uvRect.xy, instance.uvRect.zw, uvLocal);
  // Forward the corner-local UV to the FS so it can compute the
  // radial mask without re-deriving it from clip-space coords.
  out.cornerUv = cornerUv;
  out.fadeAlpha = instance.extras.x;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  let rgba = textureSample(atlasTex, atlasSmp, in.atlasUv);

  // Radial mask centred on the slot middle (cornerUv = 0.5, 0.5).
  // Fades from 1.0 inside r=0.4 to 0.0 at r≥0.5 via smoothstep.
  // Why this shape?  A galaxy thumbnail is mostly bulge in the center
  // and dim sky / image-edge artefacts at the corners — the corners
  // are exactly the part we want to hide so the quad blends into the
  // surrounding dot field instead of showing a hard JPEG square.
  // 0.4 → 0.5 gives a ~10% transition band, soft enough to look like
  // a Gaussian halo rather than a clipped circle.
  let r = length(in.cornerUv - vec2<f32>(0.5, 0.5));
  let mask = circularMask(r, 0.4, 0.5);

  // ── BRIGHTNESS-DERIVED ALPHA (sky-subtraction lite) ──────────────────────
  //
  // SDSS / DSS cutout JPEGs ship with no alpha channel (rgba.a is always
  // 1.0), so they used to render their full sky background as an opaque
  // grey square against the dark dot field — the cosmetic complaint
  // logged in 'project_thumbnail_quality.md'.
  //
  // Trick: use the maximum RGB component as alpha.  A pure-black sky
  // pixel (max ≈ 0.02) becomes nearly transparent; a galaxy body
  // (max ≈ 0.4–0.9) stays opaque; saturated stars (max = 1.0) stay fully
  // bright.  'smoothstep' applies a soft threshold so the dimmest sky
  // pixels vanish entirely instead of leaving a faint grey haze:
  //   - lum ≤ 0.05 → fully transparent (sky)
  //   - lum ≥ 0.30 → fully opaque (galaxy / star)
  // This is the "quick fix" stop-gap; the planned proper sky-subtraction
  // ('project_thumbnail_quality.md' option B) will sample corner pixels
  // and subtract a per-cutout sky level.
  let lum = max(rgba.r, max(rgba.g, rgba.b));
  let lumGate = lumAlpha(lum, 0.05, 0.30);
  // 'fadeAlpha' is the engine's per-frame fade multiplier — combines
  // distance fade (galaxies smoothly grow in as they cross the
  // apparent-size threshold) and load fade (~400 ms ramp from
  // bitmap-arrival).  Final alpha is the product of all three.
  let alpha = lumGate * mask * in.fadeAlpha;
  // Discard near-transparent fragments — pure early-out
  // optimisation.  The quad covers a full bounding box, but the
  // soft circular mask + brightness-derived 'lumAlpha' zero out the
  // corners and the dim-sky pixels.  An additive blend of
  // (rgb * ~0, ~0) on top of the HDR target would contribute
  // basically nothing visible while still costing a blend-bandwidth
  // round-trip per fragment; discarding cuts that wasted traffic
  // entirely.  (An earlier revision needed this discard to prevent
  // a depth-write punching a square footprint into the depth
  // buffer; commit 28aced5 dropped depth writes here, leaving the
  // discard as just a cheap early-out.)
  if (alpha < 0.01) { discard; }
  // Premultiplied-alpha output — required by the project's blend
  // configuration (see device.ts 'alphaMode: 'premultiplied'').
  return vec4<f32>(rgba.rgb * alpha, alpha);
}
