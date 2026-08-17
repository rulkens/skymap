/**
 * palette — SHARED linear-RGB colours only. Per-body data read once at its seed site stays
 * inline (planet albedos in `scenePlanets.ts`); star tints come from `temperatureToLinearRgb`.
 */

import type { Vec3 } from '../../@types/math/Vec3';

// Trail tints, one per body. Max channel stays ≲ 0.5 or the additive HDR draw blows out.
export const MERCURY_GREY: Vec3 = [0.42, 0.4, 0.36];
export const VENUS_CREAM: Vec3 = [0.5, 0.47, 0.33];
export const EARTH_BLUE: Vec3 = [0.15, 0.25, 0.5];
export const MARS_RED: Vec3 = [0.5, 0.2, 0.12];
export const JUPITER_TAN: Vec3 = [0.5, 0.38, 0.2];
export const SATURN_GOLD: Vec3 = [0.5, 0.43, 0.25];
export const URANUS_CYAN: Vec3 = [0.3, 0.47, 0.5];
export const NEPTUNE_BLUE: Vec3 = [0.2, 0.3, 0.55];
export const PLUTO_TAN: Vec3 = [0.38, 0.34, 0.26];
// Mauve (B > R > G) despite the name and despite Charon reading near-neutral:
// a true grey collided with MOON_GREY, the escapes with SAT_ICE and URANUS_CYAN.
export const CHARON_GREY: Vec3 = [0.4, 0.34, 0.42];
export const MOON_GREY: Vec3 = [0.35, 0.35, 0.4];

// Shared across moons: their trails cluster too tightly to read apart tint by tint.
export const SAT_ROCK: Vec3 = [0.35, 0.34, 0.32];
export const SAT_ICE: Vec3 = [0.45, 0.47, 0.5];
export const IO_SULFUR: Vec3 = [0.5, 0.45, 0.22];
export const TITAN_ORANGE: Vec3 = [0.5, 0.38, 0.2];
