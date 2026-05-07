// lib/orientation.wesl — disk-plane axis math from on-sky position angle
// + inclination, shared between 'disks.wesl' (textured thumbnails) and
// 'proceduralDisks.wesl' (impostor brightness profile).
//
// Both renderers draw a galaxy as a 3D-oriented quad whose in-plane
// basis encodes the galaxy's intrinsic orientation in world space. That
// orientation is derived from two scalar inputs the catalog provides:
//
//   - PA (position angle, east of north on the sky) → rotates the major
//     axis around the line-of-sight.
//   - axisRatio b/a → cos(i), where i is the disk's inclination relative
//     to the sky plane. Face-on (i = 0°) → axisRatio = 1; edge-on
//     (i = 90°) → axisRatio = 0.
//
// CRITICAL: this math is camera-INDEPENDENT. The disk's orientation is
// a property of the galaxy in 3D space, NOT of where the camera
// currently sits. An earlier revision of disks.wesl (now its long
// header comment) built the basis from 'camPos - center', which made
// orbiting the camera visibly rotate the disk plane — exactly the bug
// world-space orientation was rewritten to fix. Do NOT add a
// 'cameraPos' parameter to anything in this file; if you find yourself
// reaching for one, re-read disks.wesl's header. The plan for this
// task initially proposed 'diskAxes(posWS, cameraPos, ...)'; the
// 'cameraPos' was dropped after grepping the call sites confirmed
// neither consumer reads it.
//
// We also intentionally do NOT 'import package::lib::camera::CameraUniforms'
// here. orientation.wesl pre-dates the per-frame camera in the GPU's
// dependency graph: the disk basis can be computed before the view
// matrix is even uploaded. Keeping the dependency direction one-way
// (renderers import from camera + orientation; orientation imports from
// nothing) means a future "shared per-frame camera UBO" refactor can
// touch lib/camera.wesl without rippling into orientation.
//
// ## API
//
// 'diskAxes(posWS, paRad, cosI, sinI) -> DiskAxes' returns the disk's
// major and minor axes as unit-length, orthogonal vec3<f32>s in world
// coords. Each consumer's vertex stage then places a unit-square corner
// at 'center + (corner.x * axes.major + corner.y * axes.minor) * halfSize'.
//
// Why split 'cosI' / 'sinI' across two parameters rather than passing
// 'axisRatio' and computing them inside? The 'sinI = sqrt(max(0.0,
// 1.0 - cosI*cosI))' line is one statement and the consumers already
// have the convention of clamping 'axisRatio' to a 0.05 floor before
// the trig (see disks.wesl line 120 + proceduralDisks.wesl line 119).
// Doing the clamp inside this lib would either silently re-clamp a
// value the caller already clamped, or it would require a second
// "raw vs clamped" parameter — both are noisier than just letting the
// caller compute the trig pair. The function reads as pure 3D
// geometry: PA + (cos(i), sin(i)) → (major, minor).
//
// ## Frame construction (right-handed, world-fixed)
//
//   1. losDir = normalize(posWS)
//      Earth (the observer) is at world origin; losDir is the
//      direction from Earth to the galaxy.
//   2. north_proj = normalize(seed - dot(seed, losDir) * losDir)
//      Project the celestial north pole vector onto the sky tangent
//      plane at the galaxy's position. Falls back to (0, 1, 0) when
//      the galaxy is within ~8° of the celestial pole (|losDir.z| >
//      0.99) — see "## Pole degeneracy" below.
//   3. east_proj = cross(north_proj, losDir)
//      Right-handed 3-axis at the galaxy: (north_proj, east_proj,
//      losDir). PA-east-of-north therefore agrees with the
//      astronomical convention.
//   4. major = north_proj * cos(PA) + east_proj * sin(PA)
//   5. minor_in_sky = cross(losDir, major)
//   6. minor = minor_in_sky * cosI + losDir * sinI
//      Tilts the disk's true minor axis out of the sky plane by
//      inclination i.
//
// Face-on (cosI = 1, sinI = 0) → minor lies entirely in the sky plane →
// disk projects as a circle. Edge-on (cosI → 0, sinI → 1) → minor
// approaches losDir → disk is parallel to the line of sight and
// projects as a thin streak along the major axis.
//
// ## Pole degeneracy
//
// When the galaxy is within ~8° of the celestial pole, the seed
// vector (celestial north) becomes nearly parallel to losDir, so
// 'seed - dot(seed, losDir) * losDir' shrinks toward zero and a
// downstream normalize() amplifies floating-point noise. Two slightly
// different threshold conventions existed pre-extraction:
//
//   - disks.wesl: 'abs(dot(northPole, losDir)) > 0.99' (~8° from pole),
//     swap seed BEFORE the projection — wide, conservative.
//   - proceduralDisks.wesl: 'length(northTangentRaw) < 1e-4' (~exactly
//     at pole), swap result AFTER the projection — tight, only fires
//     when the projection itself is degenerate.
//
// We standardise on the proceduralDisks form (tight, post-projection
// length check). Most galaxies within 8° of the celestial pole still
// produce a usable in-sky north tangent — float math near the pole is
// fine until length(seed - dot(seed, los) * los) genuinely
// underflows, which only happens when |dot| is essentially 1.
// Falling back at the wider 0.99 threshold throws away real PA
// information for ~8° of sky around each pole; falling back only
// when the projection is numerically zero preserves PA fidelity for
// the handful of catalog galaxies that actually live up there. Both
// renderers fall back to seeding with world-y, so they still agree
// at the (much narrower) genuine-degeneracy region.
//
// ## Edge cases
//
//   - axisRatio → 0 (edge-on): the consumers clamp to 0.05 BEFORE the
//     trig pair so the quad doesn't collapse to a 1D line in the
//     vertex stage. We don't re-clamp here.
//   - posWS = (0, 0, 0) (galaxy literally at Earth): normalize() of
//     the zero vector is implementation-defined. Real catalogs never
//     emit such a row — even the closest galaxies are at non-zero
//     distance — so we don't guard against it.

struct DiskAxes {
  // Unit-length, orthogonal world-space basis vectors. The disk plane
  // is span(major, minor); the disk normal is 'cross(major, minor)'
  // (which equals 'losDir * cosI - minor_in_sky * sinI', i.e. the
  // line-of-sight direction tilted by 'i' away from the observer).
  major: vec3<f32>,
  minor: vec3<f32>,
};

fn diskAxes(posWS: vec3<f32>, paRad: f32, cosI: f32, sinI: f32) -> DiskAxes {
  // ── Line of sight ──────────────────────────────────────────────────
  let losDir = normalize(posWS);

  // ── Sky-tangent basis (north / east at the galaxy's position) ──────
  //
  // The celestial north pole lives at +Z in world coords (raDecZToCartesian
  // maps Dec = +90° to (0, 0, 1)). Project that onto the plane
  // perpendicular to losDir to recover sky-north, with the world-Y
  // fallback only when the projection is numerically degenerate (i.e.
  // the galaxy sits essentially AT the celestial pole). See "## Pole
  // degeneracy" above for why we use the tight post-projection length
  // check rather than the wider pre-projection dot-product check.
  let northPole = vec3<f32>(0.0, 0.0, 1.0);
  let northRaw = northPole - dot(northPole, losDir) * losDir;
  let northLen = length(northRaw);
  let northProj = select(
    northRaw / northLen,
    vec3<f32>(0.0, 1.0, 0.0),
    northLen < 1e-4,
  );
  // 'cross(north, los)' (rather than 'cross(los, north)') keeps the
  // (north, east, los) frame right-handed in the same sense the
  // astronomical PA-east-of-north convention expects. Reversing the
  // argument order would flip the sign of any non-zero PA's rotation.
  let eastProj = cross(northProj, losDir);

  // ── Major axis on sky (PA-east-of-north rotation) ──────────────────
  let major = northProj * cos(paRad) + eastProj * sin(paRad);

  // ── Minor axis tilted out of the sky plane by inclination ──────────
  //
  // 'minorInSky' is the in-sky perpendicular to the major axis. The
  // tilt formula 'minorInSky * cosI + losDir * sinI' rotates that
  // perpendicular AROUND the major axis by angle i. An equivalent
  // route — build the disk normal first, then take 'cross(normal,
  // major)' — flips the sign of the 'sinI * los' term (because
  // 'cross(minorInSky, major) = -losDir' in this right-handed frame),
  // tilting the disk in the OPPOSITE direction. At cosI ≈ 0.87 (i ≈
  // 30°) that sign flip shows as a visible ~30° rotation — historically
  // a real bug in proceduralDisks.wesl that the inline derivation
  // pre-extraction was carefully written to avoid. Don't reintroduce.
  let minorInSky = cross(losDir, major);
  let minor = minorInSky * cosI + losDir * sinI;

  var axes: DiskAxes;
  axes.major = major;
  axes.minor = minor;
  return axes;
}
