/**
 * createGalaxyBuildContext — builds the `GalaxyBuildContext` (see its
 * docblock for why the spike's closures became an explicit object): seeds
 * the three RNG streams, derives every scale constant from `GalaxyParams`,
 * and composes the warp offset + dust reddening onto the raw `StarWriter`/
 * `DustWriter` so downstream population builders never touch either
 * directly — they only ever call `ctx.addStar`/`ctx.addDust`.
 *
 * This function itself draws nothing from the main `rand` stream — only
 * `asymRand`, and only the four asymmetry values, in the fixed order the
 * spike drew them (model.js:183-189). The main stream's first draw belongs
 * to whichever population builder runs first (the bulge, per model.js:199),
 * not to construction. Getting that wrong would silently desync every
 * downstream builder's RNG draws from the ported formulas' expected
 * sequence — the whole point of porting a *sequence* of `Math.random()`
 * calls verbatim is that the sequence itself is part of the visual result.
 */
import { mulberry32 } from '../../../../src/utils/random/mulberry32';
import { gaussian } from '../../../utils/random/gaussian';
import { classifyHubbleType } from './classifyHubbleType';
import { createDustWriter } from './dustWriter';
import { hiiPalette } from './hiiPalette';
import { makeWarpOffset } from './makeWarpOffset';
import { splitStarBudget } from './splitStarBudget';
import { createStarWriter } from './starWriter';
import type { GalaxyBuildContext } from '../../@types/model/GalaxyBuildContext';
import type { GalaxyParams } from '../../@types/model/GalaxyParams';

const STARS_PER_GLOBULAR_CLUSTER = 90;

export function createGalaxyBuildContext(params: GalaxyParams): GalaxyBuildContext {
  // --- Random sources (model.js:79-80, 180) -------------------------------
  // `?? 0` before the bitwise op mirrors JS's own `ToInt32(undefined) === 0`
  // coercion explicitly, since TS's strict `undefined`-checking (unlike JS
  // itself) rejects `undefined | 0` as a bitwise operand.
  const rand = mulberry32((params.seed ?? 0) | 0 || 1);
  const randNormal = (): number => gaussian(rand);
  const asymRand = mulberry32(((params.asymSeed ?? 0) | 0 || 331) >>> 0);

  const category = classifyHubbleType(params.type);
  const budget = splitStarBudget(category, params);
  const { totalStars, bulgeCount, diskCount, armStarCount, haloCount } = budget;

  // --- Overall scale (model.js:85-89, 172-173) ----------------------------
  const outerRadius = 10 * (params.radius || 1);
  const diskScaleLen = outerRadius / 3.2;
  const bulgeRadius = outerRadius * 0.34 * (params.bulgeSize || 1);
  const diskHeight = 0.055 * outerRadius * (params.diskThickness || 1);
  const grainScale = Math.cbrt(400000 / totalStars);
  const starSize = 0.016 * outerRadius * grainScale;

  // --- Large-scale asymmetry (model.js:176-192) ---------------------------
  // Draw order is the contract: lopsidedAmp, lopsidedAngle, bulgeAxisZ,
  // bulgeAngle — exactly these four `asymRand` draws, in this order, and
  // nothing else draws from any stream during construction.
  const flattening =
    category === 'elliptical' ? 1 - 0.09 * (parseInt(params.type.slice(1), 10) || 0) : 0.62;
  const asymmetry = params.irregularity ?? 0.5;

  const lopsidedAmp = asymmetry * (0.06 + 0.22 * asymRand());
  const lopsidedAngle = asymRand() * Math.PI * 2;
  const applyLopsided = (radius: number, angle: number): number =>
    radius * (1 + lopsidedAmp * Math.cos(angle - lopsidedAngle));

  const bulgeAxisX = 1.0;
  const bulgeAxisY = flattening;
  const bulgeAxisZ = 1 - asymmetry * (0.05 + 0.3 * asymRand());
  const bulgeAngle = asymRand() * Math.PI * 2;
  const cosBulge = Math.cos(bulgeAngle);
  const sinBulge = Math.sin(bulgeAngle);

  const bulgeConcentration = params.bulgeFalloff ?? 0.5;

  // --- Shared shaping fns ---------------------------------------------------
  const diskFalloff = (radius: number, softness: number): number =>
    Math.exp(-radius / (diskScaleLen * softness));

  // Rejection-sampled exponential disk radius (model.js:252-257).
  const sampleDiskRadius = (): number => {
    let radius: number;
    let tries = 0;
    do {
      radius = -diskScaleLen * (Math.log(rand()) + Math.log(rand()));
    } while (radius > outerRadius * 1.5 && ++tries < 6);
    return Math.min(radius, outerRadius * 1.5);
  };

  // Steep-tailed stellar luminosity (model.js:162-165).
  const randomLuminosity = (): number => {
    const u = rand();
    return 0.12 + 0.4 * u * u * u + (rand() < 0.012 ? 3.2 * rand() : 0);
  };

  const hii = hiiPalette(params.metallicity ?? 0.5);

  // --- Write paths: warp + reddening composed here, writers stay dumb -----
  const warpOffset = makeWarpOffset(params, outerRadius);

  // Star buffer capacity: planned population totals plus the spike's
  // headroom for HII-knot bonus stars (model.js:124-125).
  const clusterCount = Math.floor(params.globularCount || 0);
  const plannedStars =
    bulgeCount + diskCount + armStarCount + haloCount + clusterCount * STARS_PER_GLOBULAR_CLUSTER;
  const starCapacity =
    plannedStars + armStarCount + Math.ceil((diskCount + armStarCount) * 0.08) + 64;

  const stars = createStarWriter(starCapacity);
  const dust = createDustWriter();

  const addStar = (
    x: number,
    y: number,
    z: number,
    r: number,
    g: number,
    b: number,
    size: number,
    brightness: number,
  ): void => {
    stars.write(x, y + warpOffset(x, z), z, r, g, b, size, brightness);
  };

  // Reddened dust colour: interstellar dust absorbs blue light more than
  // red, so thin dust reads warm (model.js:492-499). Four `rand` draws per
  // call — darkness, then the r/g/b factors, in that order.
  const addDust = (x: number, y: number, z: number, size: number, opacity: number): void => {
    const warpedY = y + warpOffset(x, z);
    const darkness = 0.02 + 0.022 * rand();
    const dr = darkness * (1.05 + 0.55 * rand());
    const dg = darkness * (0.6 + 0.22 * rand());
    const db = darkness * (0.32 + 0.26 * rand());
    dust.write(x, warpedY, z, size, dr, dg, db, opacity);
  };

  return {
    params,
    category,
    budget,

    rand,
    randNormal,
    asymRand,

    outerRadius,
    diskScaleLen,
    bulgeRadius,
    diskHeight,
    grainScale,
    starSize,

    flattening,
    asymmetry,
    applyLopsided,
    bulgeAxisX,
    bulgeAxisY,
    bulgeAxisZ,
    cosBulge,
    sinBulge,
    bulgeConcentration,

    diskFalloff,
    sampleDiskRadius,
    randomLuminosity,
    hii,

    addStar,
    addDust,
    stars,
    dust,
  };
}
