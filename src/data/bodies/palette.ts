/**
 * palette — the named linear-RGB colour constants the body tables draw with,
 * gathered in one home.
 *
 * Colour retuning is a single activity: when the additive HDR trail draw looks
 * too hot or two tints stop reading apart, the fix touches colours and nothing
 * else. Keeping every named colour here — the per-planet trail tints, the
 * shared satellite tints, and the star spectral-class palette — means that
 * activity has one place to happen, and the shared brightness constraint (a
 * trail tint's max channel stays ≲ 0.5 so the additive HDR draw doesn't blow
 * out) is stated once here instead of re-derived per row.
 *
 * The boundary: only SHARED, reusable colours live here. The planets' per-body
 * albedos stay inline in `scenePlanets.ts` — they are per-body data, not a
 * shared palette, and each is read exactly once at its seed site.
 */

import type { Vec3 } from '../../@types/math/Vec3';

// Dim, distinct linear-RGB trail tints (max channel ≲ 0.5 for the additive HDR
// draw): one per body, chosen to read apart at a glance — warm greys and golds
// for the rocky/gas giants, cool blues for the ice giants and Earth.
export const MERCURY_GREY: Vec3 = [0.42, 0.4, 0.36];
export const VENUS_CREAM: Vec3 = [0.5, 0.47, 0.33];
export const EARTH_BLUE: Vec3 = [0.15, 0.25, 0.5];
export const MARS_RED: Vec3 = [0.5, 0.2, 0.12];
export const JUPITER_TAN: Vec3 = [0.5, 0.38, 0.2];
export const SATURN_GOLD: Vec3 = [0.5, 0.43, 0.25];
export const URANUS_CYAN: Vec3 = [0.3, 0.47, 0.5];
export const NEPTUNE_BLUE: Vec3 = [0.2, 0.3, 0.55];
export const MOON_GREY: Vec3 = [0.35, 0.35, 0.4];

// Satellite trail tints — a small shared palette (the guidance moons cluster
// tightly around their planet, so a per-moon colour would not read apart):
// rocky grey, icy white, Io's sulfur yellow, Titan's haze orange.
export const SAT_ROCK: Vec3 = [0.35, 0.34, 0.32];
export const SAT_ICE: Vec3 = [0.45, 0.47, 0.5];
export const IO_SULFUR: Vec3 = [0.5, 0.45, 0.22];
export const TITAN_ORANGE: Vec3 = [0.5, 0.38, 0.2];

// The star spectral-class palette (linear RGB), one colour per class:
//   O/B blue-white [0.6, 0.7, 1.0]   (no O/B star within 10 pc — unused here)
//   A/F white      [1.0, 1.0, 0.98]  Sirius, Procyon, Altair, Vega, Fomalhaut
//   G yellow-white [1.0, 0.97, 0.85] the Sun, Alpha Cen, Tau Ceti
//   K orange       [1.0, 0.85, 0.65] Eps Eridani, 61 Cygni, Eps Indi, Pollux
//   M red          [1.0, 0.6, 0.4]   the red dwarfs
// The CPU side has no B–V → RGB helper — the colour ramp lives only in WGSL —
// and a fixed authored table does not earn one.
export const A_F_WHITE: Vec3 = [1.0, 1.0, 0.98];
export const G_YELLOW_WHITE: Vec3 = [1.0, 0.97, 0.85];
export const K_ORANGE: Vec3 = [1.0, 0.85, 0.65];
export const M_RED: Vec3 = [1.0, 0.6, 0.4];
