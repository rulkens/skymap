/**
 * horizonShellFade — distance-based alpha for the observable-universe
 * horizon shell.  The inverse regime of `milkyWayFade`: where the Milky
 * Way impostor fades *out* as the camera leaves the local volume, the
 * horizon shell fades *in* as the camera pulls back to cosmological
 * scale.
 *
 * The shell sits at the comoving particle horizon (~14.3 Gpc).  Anywhere
 * a user is studying individual galaxies it is irrelevant chrome wrapped
 * impossibly far around the scene, so it stays invisible — and, gated in
 * the pass's `enabled`, costs nothing (a full-screen ray-march fragment
 * shader is not cheap to run for an all-transparent result).  Only once
 * the camera has retreated to a meaningful fraction of the shell radius
 * does "the edge of the observable universe" become the subject worth
 * drawing.
 *
 * The band is expressed as FRACTIONS of the shell radius rather than
 * absolute Mpc, so it tracks the shell automatically: a different
 * cosmology (hence a different horizon distance) keeps the same visual
 * pacing without re-tuning.
 *
 *   - below 5 % of the radius (~0.7 Gpc): invisible.
 *   - by 40 % of the radius (~5.7 Gpc): full strength — roughly the
 *     pull-back at which the whole high-redshift quasar shell is in
 *     frame, which is the context the shell is there to provide.
 *
 * Smoothstepped between, so a slow fly-out reveals it without a pop.
 */

import { smoothstep } from './smoothstep';

const FADE_IN_START_FRAC = 0.05;
const FADE_IN_FULL_FRAC = 0.4;

export function horizonShellFadeAlpha(camDistMpc: number, shellRadiusMpc: number): number {
  return smoothstep(FADE_IN_START_FRAC * shellRadiusMpc, FADE_IN_FULL_FRAC * shellRadiusMpc, camDistMpc);
}
