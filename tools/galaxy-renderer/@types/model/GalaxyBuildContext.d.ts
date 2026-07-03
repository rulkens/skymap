/**
 * GalaxyBuildContext — the spike's closure environment, made explicit.
 *
 * `generateGalaxy` in the original spike was one 500-line function: every
 * scale constant, RNG stream, and shaping helper lived as a local variable
 * captured by inner closures (`addStar`, `warpOffset`, `sampleDiskRadius`,
 * ...), so no population builder (bulge, disk, arms, dust, ...) could be
 * tested — or even read — in isolation from the whole generator. Pulling
 * that closure environment out into one plain object is what lets the
 * per-population builders (plans 08+) stay pure functions of
 * `(ctx, count) => void` instead of each re-deriving `outerRadius` or
 * re-seeding an RNG stream: one `createGalaxyBuildContext(params)` call
 * builds the shared state once, and every builder reads it the same way a
 * test does.
 *
 * The RNG streams are the one piece of *mutable* state here — `rand`,
 * `randNormal`, and `asymRand` are shared closures whose internal counters
 * advance on every call, same as the spike's `makeRng`/`makeGaussian`
 * results. Draw order against them is therefore part of the contract, not
 * an implementation detail: two contexts built from equal `GalaxyParams`
 * must draw identical sequences, and the star population builders (which
 * this context does not run — see `createGalaxyBuildContext`'s docblock)
 * depend on the main `rand` stream being untouched until the bulge builder
 * takes its first draw. The `clump`/`wave` noise streams are deliberately
 * NOT part of this context: they're scoped to the spiral-arm builder alone
 * (model.js:295-296), so giving every consumer access to them would let an
 * unrelated builder accidentally perturb arm-clump determinism.
 */
import type { DustWriter } from './DustWriter';
import type { GalaxyCategory } from './GalaxyCategory';
import type { GalaxyParams } from './GalaxyParams';
import type { HiiPalette } from './HiiPalette';
import type { StarBudget } from './StarBudget';
import type { StarWriter } from './StarWriter';

export type GalaxyBuildContext = {
  readonly params: GalaxyParams;
  readonly category: GalaxyCategory;
  readonly budget: StarBudget;

  // ── seeded streams — SHARED MUTABLE closures; draw order is contract ──
  /** mulberry32((seed|0) || 1) — model.js:79. */
  readonly rand: () => number;
  /** () => gaussian(rand) — model.js:80. */
  readonly randNormal: () => number;
  /** mulberry32(((asymSeed|0) || 331) >>> 0) — model.js:180. */
  readonly asymRand: () => number;

  // ── scale constants — model.js:85-89, 172-173 ──
  readonly outerRadius: number;
  readonly diskScaleLen: number;
  readonly bulgeRadius: number;
  readonly diskHeight: number;
  readonly grainScale: number;
  readonly starSize: number;

  // ── asymmetry — model.js:176-192 ──
  readonly flattening: number;
  readonly asymmetry: number;
  readonly applyLopsided: (radius: number, angle: number) => number;
  readonly bulgeAxisX: number;
  readonly bulgeAxisY: number;
  readonly bulgeAxisZ: number;
  readonly cosBulge: number;
  readonly sinBulge: number;
  readonly bulgeConcentration: number;

  // ── shared shaping fns ──
  readonly diskFalloff: (radius: number, softness: number) => number;
  /** Rejection-sampled exponential disk radius. Draws from `rand`. */
  readonly sampleDiskRadius: () => number;
  /** Steep-tailed stellar luminosity. Draws from `rand`. */
  readonly randomLuminosity: () => number;
  readonly hii: HiiPalette;

  // ── write paths — warp/reddening composed HERE, writers stay dumb ──
  readonly addStar: (
    x: number,
    y: number,
    z: number,
    r: number,
    g: number,
    b: number,
    size: number,
    brightness: number,
  ) => void;
  /** Draws darkness + three channel factors from `rand` per call. */
  readonly addDust: (x: number, y: number, z: number, size: number, opacity: number) => void;
  readonly stars: StarWriter;
  readonly dust: DustWriter;
};
