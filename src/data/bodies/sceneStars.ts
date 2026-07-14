/**
 * sceneStars — the local star map: authored seeds for the descent's foreground
 * stars.
 *
 * These are data, not runtime state: constants the descent renders against once
 * the zoom reaches the local (sub-kiloparsec) neighbourhood. Each star is
 * authored in the units a human reads it in — RA/Dec at so many parsecs — and
 * the `star` maker converts to the canonical Megaparsec draw-space frame.
 *
 * Star positions go through `raDecDistToCartesian` (inside `star`) — the SAME
 * right-handed equatorial J2000 spherical→Cartesian conversion the galaxy build
 * pipeline uses — so the seeded neighbourhood is NOT rotated against the real
 * sky the catalogues paint. The Sun is seeded with distPc = 0, which collapses
 * the conversion to the origin [0, 0, 0] regardless of RA/Dec — the frame is
 * heliocentric.
 *
 * Star-selection rule: the Sun, PLUS one representative entry per stellar system
 * within ~4 pc (A/B components merged into their primary — e.g. Alpha Centauri
 * A+B as one entry — EXCEPT Proxima Centauri, kept as its own entry because its
 * ~1.301 pc distance is the parsec-scale f64 anchor the tests pin), PLUS the
 * naked-eye landmark stars out to ~10 pc (Sirius, Procyon, Altair, Vega,
 * Fomalhaut, Pollux, …).
 *
 * Provenance: RA/Dec (J2000), distances, and absolute magnitudes are standard
 * published values (Hipparcos / Gaia-era, as commonly tabulated in the
 * nearest-stars and brightest-stars compilations). Merged systems carry the
 * primary's absMag and the system position at the primary's precision. Colours
 * are the spectral-class palette in `palette.ts`.
 */

import { star } from './makers/star';
import { A_F_WHITE, G_YELLOW_WHITE, K_ORANGE, M_RED } from './palette';
import type { StarBody } from '../../@types/scene/StarBody';

/**
 * The local star map, per the selection rule and provenance in the module
 * header. Columns: id, label, RA° (J2000), Dec° (J2000), distance pc, absMag,
 * spectral-class colour.
 */
export const SCENE_STARS: readonly StarBody[] = [
  star('sun', 'Sun', 0, 0, 0, 4.83, G_YELLOW_WHITE),
  star('proxima-centauri', 'Proxima Centauri', 217.4289, -62.6795, 1.301, 15.6, M_RED),
  star('alpha-centauri', 'Alpha Centauri', 219.9021, -60.8339, 1.339, 4.38, G_YELLOW_WHITE),
  star('barnards-star', "Barnard's Star", 269.4521, 4.6934, 1.834, 13.21, M_RED),
  star('wolf-359', 'Wolf 359', 164.1204, 7.0147, 2.409, 16.65, M_RED),
  star('lalande-21185', 'Lalande 21185', 165.8341, 35.9699, 2.547, 10.48, M_RED),
  star('sirius', 'Sirius', 101.2871, -16.7161, 2.64, 1.45, A_F_WHITE),
  star('luyten-726-8', 'Luyten 726-8', 24.7554, -17.9503, 2.68, 15.47, M_RED),
  star('ross-154', 'Ross 154', 282.4558, -23.8361, 2.98, 13.07, M_RED),
  star('ross-248', 'Ross 248', 355.4779, 44.175, 3.16, 14.79, M_RED),
  star('epsilon-eridani', 'Epsilon Eridani', 53.2325, -9.4583, 3.22, 6.19, K_ORANGE),
  star('lacaille-9352', 'Lacaille 9352', 346.4667, -35.8531, 3.29, 9.75, M_RED),
  star('ross-128', 'Ross 128', 176.935, 0.8044, 3.37, 13.51, M_RED),
  star('ez-aquarii', 'EZ Aquarii', 339.6392, -15.2992, 3.5, 15.33, M_RED),
  star('61-cygni', '61 Cygni', 316.7246, 38.7494, 3.5, 7.49, K_ORANGE),
  star('procyon', 'Procyon', 114.8254, 5.225, 3.51, 2.66, A_F_WHITE),
  star('struve-2398', 'Struve 2398', 280.6946, 59.6303, 3.55, 11.16, M_RED),
  star('groombridge-34', 'Groombridge 34', 4.5954, 44.0231, 3.56, 10.32, M_RED),
  star('epsilon-indi', 'Epsilon Indi', 330.8404, -56.7861, 3.64, 6.89, K_ORANGE),
  star('tau-ceti', 'Tau Ceti', 26.0171, -15.9375, 3.65, 5.68, G_YELLOW_WHITE),
  star('kapteyns-star', "Kapteyn's Star", 77.9192, -45.0183, 3.93, 10.87, M_RED),
  star('altair', 'Altair', 297.6958, 8.8683, 5.13, 2.22, A_F_WHITE),
  star('vega', 'Vega', 279.2346, 38.7836, 7.68, 0.58, A_F_WHITE),
  star('fomalhaut', 'Fomalhaut', 344.4125, -29.6222, 7.7, 1.72, A_F_WHITE),
  star('pollux', 'Pollux', 116.3289, 28.0261, 10.34, 1.08, K_ORANGE),
];
