// thumbnails/vertex.wesl — billboard galaxy-thumbnail vertex stage.
//
// Each instance is one textured quad whose world-space center
// matches a galaxy and whose size is computed from the engine's
// apparent-size threshold logic. The vertex stage projects the
// galaxy center to clip space, then offsets each corner by a
// pixel-derived half-extent along a basis aligned with celestial
// north — so the texture's 'north-up' content stays aligned with
// the world's celestial north as the camera rolls.
//
// ### Why celestial-north billboards instead of camera-locked
//
// The first cut used screen-X / screen-Y as the billboard basis,
// matching the canonical 'points' shader. That decoupled the
// texture's astrophotography content (which is north-up by SDSS /
// DSS source convention) from celestial north — the moment the user
// rolled the camera, the thumbnails stayed stuck to the screen
// while the points-pass elliptical mask (which rotates by the sky
// position-angle) drifted away from the texture's dust-lane / disk
// orientation. We now build the basis from the projected celestial-
// north direction at each galaxy's screen position so the texture's
// north tracks the world's celestial north.
//
// ## Why bindings are declared here, not in io.wesl
//
// Same WESL no-global-state argument as elsewhere: 'Uniforms' is
// imported from io.wesl, the @group/@binding declaration lives in
// the consuming file, and the layout matches fragment.wesl's
// identical declaration. Atlas-texture / sampler bindings are
// fragment-only and stay in fragment.wesl.

import package::thumbnails::io::Uniforms;
import package::thumbnails::io::InstanceIn;
import package::thumbnails::io::VsOut;
import package::lib::camera::worldToClip;
// Shared unit-quad helpers from 'lib/billboard.wesl' — replace the
// inline 'CORNERS' const + '(corner + 1) * 0.5' UV remap that used to
// live in this file. The view-aligned celestial-north basis math
// stays renderer-specific (see 'NORTH_WORLD' / 'upClip' below); only
// the vertex-index → corner / UV lookups are shared.
import package::lib::billboard::quadCorner;
import package::lib::billboard::quadUv;

@group(0) @binding(0) var<uniform> u: Uniforms;

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
  // that decoupled the texture's 'north-up' content from celestial
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
  // projected center gives the screen-space direction 'toward sky north'
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
  // '-PA' rotation in points.wesl agrees with the quad's local +Y meaning
  // 'celestial north'.
  let rightPxNorm = vec2<f32>(upPxNorm.y, -upPxNorm.x);

  // Apply the corner offset along the celestial-north basis instead of
  // screen X / Y.
  let offsetPx = corner.x * halfPixels * rightPxNorm + corner.y * halfPixels * upPxNorm;

  // Convert pixels to clip-space half-extent.  As in points.wesl, we
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
