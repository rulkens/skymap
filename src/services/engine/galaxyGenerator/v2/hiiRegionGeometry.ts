/**
 * Math-derivation exception (comments.md): shared HII-region truth — the age
 * gate splitting `sfEventCatalog.ts`'s events into glowing knots (young) and
 * swept dust cavities (old), the Kennicutt luminosity draw, and the
 * Strömgren radius that follows from it. Imported by both `hiiRegions.ts`
 * (emission) and `dustBubblePlacements.ts` (cavities) so the two tiers
 * cannot drift apart on where one event's phase ends and the next begins.
 */
import { pcToUnits } from '../../../../utils/galaxy/pcToUnits';
import type { Vec3 } from '../../../../@types/math/Vec3';

/** age01 at or below this is a glowing HII knot; above it, a swept bubble. */
export const HII_AGE_GATE = 0.35;

/**
 * Kennicutt 1989's HII-region luminosity function dN/dL ~ L^-2, drawn over
 * four decades. The span is what produces a few 30-Doradus-class giants
 * among many dwarfs; narrowing it flattens the population into same-sized
 * dots, which is the look this tier exists to avoid.
 */
const LUMINOSITY_POWER = 2;
const LUMINOSITY_MAX = 1e4;

/** Strömgren radius of the faintest region drawn, parsecs — Orion-class. */
const RADIUS_MIN_PC = 10;

/** Inverse CDF of dN/dL ~ L^-a over [1, LUMINOSITY_MAX], in units of the faintest. */
export function hiiLuminosity(u: number): number {
  const exp = 1 - LUMINOSITY_POWER;
  const maxPow = LUMINOSITY_MAX ** exp;
  return (u * (maxPow - 1) + 1) ** (1 / exp);
}

/**
 * One event's luminosity, from the uniform already inside `SfEvent.strength`
 * (drawn as `0.5 + rng()`). Reusing that draw rather than opening a second
 * RNG stream is what lets the emission tier and the dust-cavity tier size the
 * same event identically without either re-seeding.
 */
export function hiiLuminosityOf(event: { readonly strength: number }): number {
  return hiiLuminosity(Math.min(1, Math.max(0, event.strength - 0.5)));
}

/**
 * R_s ~ Q^(1/3) and L_Ha ~ Q, so radius is the cube root of the luminosity
 * draw. Size and brightness come from ONE draw rather than two independent
 * ones — a bright compact knot and a faint giant are both unphysical.
 */
export function hiiRadiusUnits(luminosity: number, radiusScale: number): number {
  return pcToUnits(RADIUS_MIN_PC) * Math.cbrt(luminosity) * radiusScale;
}

/**
 * The embedded OB association — hotter and bluer than `ARM_COLOR_YOUNG`. NOT on
 * `hiiPalette`, deliberately: this is stellar continuum, and the sprite tier
 * colours its counterpart (`buildArmSlot`'s newborn stars) off `tempColorRamp`
 * rather than `gen.hiiCore`/`gen.hiiHalo` for the same reason.
 */
export const HII_CLUSTER_COLOR: Readonly<Vec3> = [0.62, 0.75, 1.0];
