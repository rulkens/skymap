// orbitRing/fragment.wesl — analytic SDF ring with an orbit-trail brightness
// falloff at the orbiting body's position, for the additive HDR target.
//
// ## Why an SDF ring beats line geometry across 12+ orders of magnitude
//
// The orbits span from the Moon's ~4e-14 Mpc radius to Jupiter's ~2.5e-11,
// viewed from metres to megaparsecs away. Line-strip geometry would need
// per-zoom tessellation LOD to stay smooth (a 64-segment circle looks
// polygonal when it fills the screen) AND a screen-space width recomputation
// to stay visible when the ring subtends a handful of pixels. The SDF ring
// gets both for free: the distance field 'abs(length(p) - 1)' IS the exact
// circle at every scale, and 'fwidth' measures how fast that field changes
// per PIXEL, so thresholding distance against 'fwidth(d) * 1.5' yields a
// constant ~1.5 px anti-aliased stroke at ANY zoom — no vertices to
// re-tessellate, no width uniform to update. Same fwidth-based AA idiom the
// selectionRing / diskRadiusRing overlays use, applied in a 3D orbital plane
// instead of screen space.
//
// ## Why the brightness encodes recency of passage, not a symmetric lobe
//
// Brightness marks how long ago the body was AT that point on the ring, so
// the bright tail TRAILS the body and the dimmest point sits just AHEAD of
// it — that asymmetry is what tells the eye which way the body is moving,
// for free, with no arrow or extra geometry. A symmetric lobe (bright on
// both sides of the body, dim only on the far side) was the alternative;
// it draws the eye to the body just as well but throws away the direction
// cue. The orbit table ('sceneOrbits.ts') aims the plane basis 'uAxis' at
// the body and 'vAxis' prograde ('v = normal x u') by construction, so the
// body sits at local angle 0 and increasing angle IS the direction of
// travel — the falloff below needs no per-instance angle plumbing.
//
// ## Output
//
// 'color * brightness * ring' with alpha 1 for the one/one additive blend —
// the rgb IS the added light (the HDR convention every additive layer
// shares); alpha is ignored by the blend but kept at 1 for consistency.

import package::orbitRing::io::VSOut;
import package::lib::math::PI;

// Decay rate of the trail brightness per radian behind the body. Larger
// values shrink the visible tail; 1.2 spans roughly a third of the orbit
// before bottoming out at TRAIL_FLOOR.
const TRAIL_DECAY: f32 = 1.2;
// Brightness floor for the arc far behind / just ahead of the body. The
// whole orbit must stay clearly visible — the trail gradient is a direction
// cue layered ON TOP of an always-legible path, not a fade-to-black.
const TRAIL_FLOOR: f32 = 0.15;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // Signed distance to the unit circle in the local plane.
  let d = abs(length(in.local) - 1.0);

  // Screen-space stroke width: fwidth(d) is the per-pixel change of the
  // distance field, so w spans ~1.5 px regardless of zoom. Guard the
  // degenerate fwidth == 0 case (e.g. a ring collapsed to sub-pixel size)
  // with a tiny epsilon so the smoothstep edge never has zero width.
  let w = max(fwidth(d) * 1.5, 1e-6);
  let ring = 1.0 - smoothstep(0.0, w, d);

  // Angle-behind-the-body: 0 AT the body, growing across the retrograde
  // (already-passed) side of the ring, wrapping through ~2*PI just AHEAD
  // of it (about to be reached almost a full orbit from now). 't' is
  // WGSL atan2's (-PI, PI] range; 'select(f, t, cond)' returns 't' when
  // 'cond' holds, so the branch below picks '-t' on the retrograde half
  // (t <= 0) and '2*PI - t' on the prograde half, and the two branches
  // agree at the t = PI / -PI seam (both give PI) so delta is continuous
  // everywhere except the single intentional jump back to 0 at the body.
  let t = atan2(in.local.y, in.local.x);
  let delta = select(2.0 * PI - t, -t, t <= 0.0);
  let brightness = TRAIL_FLOOR + (1.0 - TRAIL_FLOOR) * exp(-TRAIL_DECAY * delta);

  return vec4<f32>(in.color * brightness * ring, 1.0);
}
