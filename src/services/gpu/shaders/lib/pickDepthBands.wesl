// lib/pickDepthBands.wesl — the shared NEAR0 pick-priority depth bands.
//
// ## The problem: importance is not distance
//
// Every NEAR0 pick pipeline is depth-tested + depth-writing ('depthCompare:
// less', depth32float, cleared to 1.0), so at a contested pixel the WINNER is
// the fragment with the SMALLEST z/w and registry draw order only breaks exact
// ties. Left to true surface depth that means a physically nearer thing wins —
// which is wrong for CLICK PRIORITY. A dense Gaia field star sitting a parsec
// in front of a famous star would steal its click; the Milky Way impostor's
// true depth would beat a forced-far star. The user wants IMPORTANCE order, not
// nearness order: survey (Gaia) background always behind famous/scene stars,
// planets and moons; the Milky Way backdrop last of all.
//
// ## The mechanism: depth bands just inside the far-plane clear
//
// Rather than add a priority channel or reorder passes, we exploit the depth
// test already running. Each importance class writes its pick fragment at a
// FIXED depth 'z = w * (1 - eps)', a thin band pulled just inside the 1.0 clear.
// Because 'less' wins for the SMALLER z/w, and z/w = (1 - eps), a LARGER eps
// sits at a SMALLER depth and therefore WINS. Ordering the bands by descending
// eps ranks the classes:
//
//   scene-star band   eps = 1.00e-4  → z/w = 0.9999   (shallowest, wins)
//   survey-star band  eps = 0.50e-4  → z/w = 0.99995
//   backdrop band     eps = 0.25e-4  → z/w = 0.999975 (deepest, loses)
//
// So at any pixel where the classes overlap: scene/famous stars beat survey
// stars beat the Milky Way backdrop — pure importance, independent of true
// distance. (Classes that keep TRUE depth — resolved spheres, AU-scale glint
// planets/moons, and within-far scene stars — sit in front of every band
// automatically because their z/w is well below 0.9999 at foreground range;
// that is the planets/moons + physical-star priority, free.)
//
// ## Why these three values are safe to distinguish
//
// All three stay strictly inside the 1.0 clear, so a banded fragment always
// survives the clip test (the same clip-survival property the visual far-plane
// clamp needs). depth32float near 1.0 resolves steps of roughly 1e-7, and the
// tightest gap here is 0.25e-4 = 2.5e-5 — about 250 resolvable steps — so the
// bands never collapse into one another through float rounding. Wider gaps than
// strictly necessary would eat into the true-depth headroom below 0.9999 that
// the front classes rely on; these three cluster tightly just under the clear.
//
// ## The consumers
//
//   - starCatalog/vertex.wesl  — FORCES clip.z to PICK_BAND_SURVEY_STAR_EPS in
//                                the pick pass (survey stars always lose to
//                                scene stars / glints / spheres).
//   - bodies/starPointPick.wesl — clamps true depth to PICK_BAND_SCENE_STAR_EPS
//                                (within-far scene stars keep true depth; a
//                                beyond-far one lands on the scene band, still
//                                ahead of every survey star).
//   - milkyWayPick/vertex.wesl — FORCES clip.z to PICK_BAND_BACKDROP_EPS (the
//                                impostor is the ultimate fallback).
//
// The constants live here, not in any one consumer, so the three bands can
// never drift out of order and silently invert the priority — the same
// single-source discipline lib/starPhotometry.wesl uses for its parity
// constants. A sign or magnitude slip in one eps would flip a class's rank
// without any compile error, so the ordering is asserted once, here, by the
// descending values and this header.

// Scene / famous stars + glint planets/moons — the shallowest band, so this
// class wins every contested pick. This is the value the survey and scene pick
// stages previously each spelled inline as their local 'CLIP_Z_EPS' far-plane
// clamp; naming it as a band keeps the front class exactly where it was while
// making the ordering explicit.
const PICK_BAND_SCENE_STAR_EPS: f32 = 1e-4;

// Gaia survey stars — deeper than the scene band, so a survey star always loses
// a contested pixel to a scene/famous star, glint, or sphere. Half the scene
// eps.
const PICK_BAND_SURVEY_STAR_EPS: f32 = 0.5e-4;

// Milky Way impostor backdrop — the deepest band, the ultimate fallback: any
// resolvable Gaia dot overlapping the galaxy backdrop now wins the click over
// it. A quarter of the scene eps.
const PICK_BAND_BACKDROP_EPS: f32 = 0.25e-4;
