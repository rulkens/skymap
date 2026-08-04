// lib/pickDepthBands.wesl — the shared NEAR0 pick-priority depth bands.
//
// ## The problem: importance is not distance
//
// Every NEAR0 pick pipeline is depth-tested + depth-writing ('depthCompare:
// greater', depth32float, cleared to 0.0), so at a contested pixel the WINNER is
// the fragment with the LARGEST z/w and registry draw order only breaks exact
// ties. Left to true surface depth that means a physically nearer thing wins —
// which is wrong for CLICK PRIORITY. A dense Gaia field star sitting a parsec
// in front of a famous star would steal its click; the Milky Way impostor's
// true depth would beat a forced-far star. The user wants IMPORTANCE order, not
// nearness order: survey (Gaia) background always behind famous/scene stars,
// planets and moons; the Milky Way backdrop last of all.
//
// ## The mechanism: depth bands just above the far-plane clear
//
// Rather than add a priority channel or reorder passes, we exploit the depth
// test already running. Each importance class writes its pick fragment at a
// FIXED depth 'z = w * eps', a thin band pulled just above the 0.0 clear.
// Because 'greater' wins for the LARGER z/w, and z/w = eps, a LARGER eps
// sits at a LARGER depth and therefore WINS. Ordering the bands by descending
// eps ranks the classes:
//
//   earth glint band   eps = 5.00e-4  → z/w = 0.00050   (highest, wins)
//   planet glint band  eps = 4.50e-4  → z/w = 0.00045
//   moon glint band    eps = 4.00e-4  → z/w = 0.00040
//   scene-star band    eps = 1.00e-4  → z/w = 0.00010
//   survey-star band   eps = 0.50e-4  → z/w = 0.00005
//   backdrop band      eps = 0.25e-4  → z/w = 0.000025  (lowest, loses)
//
// So at any pixel where the classes overlap: the Earth glint beats a planet
// glint beats a moon glint beats scene/famous stars beat survey stars beat the
// Milky Way backdrop — pure importance, independent of true distance. (Classes
// that keep TRUE depth — resolved spheres, and within-far scene stars — sit in
// front of every band automatically because their z/w is well above 0.00050 at
// foreground range (reversed-Z: nearer = larger z); that is the resolved-sphere +
// physical-star priority, free. A glint deliberately LOSES to a resolved sphere
// nearer than ~orbitDistance/4, whose true z/w rises above the glint bands — a
// planet's own disk out-picks its glint stamp, which is right.)
//
// ## Why the glint class carries its priority as DATA, not draw order
//
// An earlier design forced EVERY glint onto ONE depth and relied on the
// instance DRAW ORDER to break the exact-depth tie (Earth first, then planets,
// then moons). That was unreliable: 'z = w * (1 - eps)' followed by the
// rasterizer's 'z / w' is NOT bit-exact across instances — each instance's
// different w rounds differently, so the forced depths jitter by a ulp and the
// intended draw-order tie-break degenerates into rounding-noise roulette. It
// also hid a coupling in the seed order (Earth prepended, planets-before-moons).
//
// The fix here makes priority EXPLICIT per-instance data: each glint carries a
// band CLASS (0 = earth, 1 = planet, 2 = moon) and 'starPointPick.wesl::vsGlint'
// maps the class to its OWN band above. The three glint bands are separated by
// 5e-5 in z/w — a vast number of f32-resolvable steps near the 0.0 clear, where
// depth32float resolution is far finer than the ~6e-8 it holds near 1.0 — so
// planet-over-moon and earth-over-both are UNCONDITIONAL depth wins, needing no
// ordering and admitting no ties. Nearness cannot invert them (all three force
// their band regardless of true depth), and draw order is irrelevant.
//
// ## Why these six values are safe to distinguish
//
// All six stay strictly above the 0.0 clear (positive z/w), so a banded fragment
// always survives the clip test (the same clip-survival property the visual
// clamp needs). depth32float resolves far finer than 6e-8 near the 0.0 clear, and
// the tightest gap here is 0.25e-4 = 2.5e-5 — a vast number of resolvable steps —
// so the bands never collapse into one another through float rounding. The three
// glint bands sit HIGHEST in the true-depth headroom (0.00040–0.00050), which is
// deliberate: a resolved sphere must rise above the highest glint band to
// out-pick a glint, and a foreground sphere's true z/w is far above it (reversed-Z:
// nearer = larger z), so that boundary lands exactly where a planet's disk grows
// past its glint stamp. Wider gaps than necessary among the three star/backdrop
// bands would eat that headroom for no rank gain, so those three still cluster
// tightly just above the clear.
//
// ## The consumers
//
//   - starCatalog/vertex.wesl  — FORCES clip.z to PICK_BAND_SURVEY_STAR_EPS in
//                                the pick pass (survey stars always lose to
//                                scene stars / glints / spheres).
//   - bodies/starPointPick.wesl — TWO entry points share this module: 'vs' clamps
//                                true depth to PICK_BAND_SCENE_STAR_EPS (within-far
//                                scene stars keep true depth; a beyond-far one
//                                lands on the scene band, still ahead of every
//                                survey star). 'vsGlint' FORCES clip.z to the
//                                per-instance glint CLASS band (earth / planet /
//                                moon eps below) so importance, not nearness,
//                                decides among glints.
//   - milkyWay/pick/vertex.wesl — FORCES clip.z to PICK_BAND_BACKDROP_EPS (the
//                                impostor is the ultimate fallback).
//
// The constants live here, not in any one consumer, so the bands can never drift
// out of order and silently invert the priority — the same single-source
// discipline lib/starPhotometry.wesl uses for its parity constants. A sign or
// magnitude slip in one eps would flip a class's rank without any compile error,
// so the ordering is asserted once, here, by the descending values and this
// header.

// The three GLINT class bands — the sub-pixel solar-system bodies. Each glint
// carries its class (0 earth, 1 planet, 2 moon); 'starPointPick.wesl::vsGlint'
// maps the class to the matching eps below. All three are HIGHER-z than the
// scene band, so any glint out-picks a scene star, survey star, or backdrop; and
// the 5e-5 spacing makes earth-over-planet-over-moon an unconditional depth win,
// independent of nearness or draw order. A resolved sphere nearer than
// ~orbitDistance/4 keeps a true z/w above these bands and correctly out-picks the
// glint (a planet's own disk beats its glint stamp).
const PICK_BAND_EARTH_EPS: f32 = 5.0e-4; // z/w 0.00050 — highest, Earth wins
const PICK_BAND_PLANET_EPS: f32 = 4.5e-4; // z/w 0.00045
const PICK_BAND_MOON_EPS: f32 = 4.0e-4; // z/w 0.00040

// Scene / famous stars — deeper than the glint bands, so a within-far scene star
// still loses a contested pixel to a sub-pixel glint but beats every survey star
// and the backdrop. This is the value the survey and scene pick stages previously
// each spelled inline as their local 'CLIP_Z_EPS' far-plane clamp; naming it as a
// band keeps that class exactly where it was while making the ordering explicit.
const PICK_BAND_SCENE_STAR_EPS: f32 = 1e-4;

// Gaia survey stars — deeper than the scene band, so a survey star always loses
// a contested pixel to a scene/famous star, glint, or sphere. Half the scene
// eps.
const PICK_BAND_SURVEY_STAR_EPS: f32 = 0.5e-4;

// Milky Way impostor backdrop — the deepest band, the ultimate fallback: any
// resolvable Gaia dot overlapping the galaxy backdrop now wins the click over
// it. A quarter of the scene eps.
const PICK_BAND_BACKDROP_EPS: f32 = 0.25e-4;

// The glint priority CLASS integers — the per-instance selector each glint
// carries, which 'starPointPick.wesl::vsGlint' maps to the three glint eps bands
// above (EARTH -> PICK_BAND_EARTH_EPS, PLANET -> PICK_BAND_PLANET_EPS, else the
// MOON band). This is the single WESL home for the class values; the TS twin is
// 'glintBandClass.ts', and a parity test pins the two so a class renumbered on
// one side without the other (which would silently mis-map a body to the wrong
// priority band, no compile error) is caught. The MOON value is the vsGlint
// 'else' fallthrough, so the shader imports only EARTH + PLANET, but all three
// are named here as the class vocabulary the parity test asserts.
const GLINT_CLASS_EARTH: u32 = 0u;
const GLINT_CLASS_PLANET: u32 = 1u;
const GLINT_CLASS_MOON: u32 = 2u;
