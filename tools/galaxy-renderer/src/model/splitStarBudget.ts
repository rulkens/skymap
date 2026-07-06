/**
 * splitStarBudget — divides a galaxy's total star budget across its four
 * structural populations (bulge / disk / spiral-arm / halo). Each
 * `GalaxyCategory` puts its stars in different places, so this is a table
 * dispatch keyed by category rather than an if/else predicate chain — adding
 * a family means adding a table entry, not threading another branch through
 * shared logic. 'spiral' and 'barred' are structurally identical (bulge
 * fraction grows with `bulgeSize`, the rest splits between disk and arms)
 * and differ only in how tightly barred galaxies pack their bulge, so they
 * share one parameterised entry instead of two near-duplicate ones.
 *
 * Formulas ported verbatim from galaxy-model.js:89-116.
 */
import type { GalaxyCategory } from '../../../../src/@types/galaxy/GalaxyCategory';
import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';
import type { StarBudget } from '../../../../src/@types/galaxy/StarBudget';

type PopulationSplit = {
  readonly bulgeCount: number;
  readonly diskCount: number;
  readonly armStarCount: number;
  readonly haloCount: number;
};

type Splitter = (
  totalStars: number,
  params: GalaxyParams,
  category: GalaxyCategory,
) => PopulationSplit;

// Smooth spheroid: almost everything is bulge, the rest is a diffuse stellar
// halo. No disk, no arms — ellipticals have neither.
const splitElliptical: Splitter = (totalStars) => {
  const bulgeCount = Math.floor(totalStars * 0.9);
  return { bulgeCount, diskCount: 0, armStarCount: 0, haloCount: totalStars - bulgeCount };
};

// Bulge + featureless disk, no spiral structure — the defining trait of S0.
const splitLenticular: Splitter = (totalStars) => {
  const bulgeCount = Math.floor(totalStars * 0.55);
  const diskCount = Math.floor(totalStars * 0.4);
  return { bulgeCount, diskCount, armStarCount: 0, haloCount: totalStars - bulgeCount - diskCount };
};

// Chaotic dwarfs: a small bulge, no smooth exponential disk at all — the
// bulk of the budget goes into the irregular "arm-slot" clumps, with the
// remainder as halo.
const splitIrregular: Splitter = (totalStars) => {
  const bulgeCount = Math.floor(totalStars * 0.06);
  const armStarCount = Math.floor(totalStars * 0.86);
  return {
    bulgeCount,
    diskCount: 0,
    armStarCount,
    haloCount: totalStars - bulgeCount - armStarCount,
  };
};

// Spiral / barred: bulge fraction grows with bulgeSize, capped at 0.55, and
// shrinks a touch when barred (bars trade bulge mass for a flatter, more
// elongated core). Whatever's left of the budget after the bulge splits
// between arms (scaled by armStrength) and a smooth disk; no halo — spirals
// and barred spirals don't get one. The spike's falsy-fallback semantics
// (|| not ??) mean an explicit bulgeSize of 0 also maps to 1.
const splitSpiralLike: Splitter = (totalStars, params, category) => {
  const bulgeFraction = 0.12 + 0.35 * (params.bulgeSize || 1) * (category === 'barred' ? 0.8 : 1);
  const bulgeCount = Math.floor(totalStars * Math.min(0.55, bulgeFraction));
  const armFraction = 0.4 * (params.armStrength ?? 1);
  const diskRemainder = totalStars - bulgeCount;
  const armStarCount = Math.floor(diskRemainder * armFraction);
  const diskCount = diskRemainder - armStarCount;
  return { bulgeCount, diskCount, armStarCount, haloCount: 0 };
};

const SPLITTERS: Record<GalaxyCategory, Splitter> = {
  elliptical: splitElliptical,
  lenticular: splitLenticular,
  irregular: splitIrregular,
  barred: splitSpiralLike,
  spiral: splitSpiralLike,
};

export function splitStarBudget(category: GalaxyCategory, params: GalaxyParams): StarBudget {
  const totalStars = Math.max(20000, Math.floor(params.starCount || 400000));
  const split = SPLITTERS[category](totalStars, params, category);
  return { totalStars, ...split };
}
