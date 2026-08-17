/**
 * galaxyLightDecomposition — literature-calibrated table: one galaxy's light
 * split across bulge / bar / disc / halo, read off by RC3 stage. Provenance
 * for two anomalous rows is the source of truth for not "fixing" them, hence
 * the longer-than-usual comments below. Where the numbers come from, in
 * which band, and what each lane means: `GalaxyLightDecomposition`.
 *
 * Which lanes a galaxy may SPEND is the category's call, not the stage's: the
 * generator builds a bar only where `barLengthOf` returns one and a disc only
 * outside the elliptical family, so a lane it cannot build is light nothing
 * emits — the two gates below are where the literature's taxonomy and the
 * generator's five families meet, and the only place they do.
 */
import { barLengthOf } from './barLengthOf';
import { hubbleStageOf } from './hubbleStageOf';
import { lerp } from '../../../../utils/math/lerp';
import type { GalaxyCategory } from '../../../../@types/galaxy/GalaxyCategory';
import type { GalaxyLightDecomposition } from '../../../../@types/galaxy/GalaxyLightDecomposition';
import type { GalaxyParams } from '../../../../@types/galaxy/GalaxyParams';

type StageRow = {
  readonly stage: number;
  readonly bulge: number;
  /** Conditional on a bar having been fitted; only a `barred` galaxy spends it. */
  readonly bar: number;
  readonly halo: number;
};

/**
 * Ascending in stage, linearly interpolated between rows. `N` is the B/T
 * sample size; the Bar/T column's own N is 14-96 per row and never the
 * constraint. Two rows to distrust, both flagged rather than smoothed:
 *
 * - **T=4 (Sbc)**: 0.04 sits below BOTH neighbours because S4G fitted a bar in
 *   only 16% of that bin while Buta classified 33% of it as SAB or SB. Gao et
 *   al. 2019 (ApJS 244, 34; R band, CGS, N=320) binned the same way gives a
 *   smooth 0.13/0.11/0.10/0.09/0.06/0.05 down these six rows and is the
 *   documented fallback if the dip ever shows on screen.
 * - **T=6, T=7 (Sd)**: N=13 and N=6, and their B/T disagrees in the wrong
 *   direction. Read the whole T>=6 end as "small and poorly measured".
 *
 * No shipped `GalaxyParams.type` reaches either: the roster stops at Sc.
 */
const DECOMPOSITION_BY_STAGE: readonly StageRow[] = [
  // E: all spheroid, so the disc remainder below comes out at zero on its own.
  { stage: -5, bulge: 0.98, bar: 0, halo: 0.02 },
  { stage: -2, bulge: 0.33, bar: 0.13, halo: 0.02 }, // S0, N=35
  { stage: 1, bulge: 0.25, bar: 0.17, halo: 0.02 }, // Sa, N=26
  { stage: 3, bulge: 0.14, bar: 0.1, halo: 0.02 }, // Sb, N=20
  { stage: 4, bulge: 0.11, bar: 0.04, halo: 0.02 }, // Sbc, N=38 — weak bar cell
  { stage: 5, bulge: 0.11, bar: 0.06, halo: 0.02 }, // Sc, N=30
  { stage: 6, bulge: 0.05, bar: 0.05, halo: 0.03 }, // Scd, N=13 — weak
  { stage: 7, bulge: 0.09, bar: 0.07, halo: 0.03 }, // Sd, N=6 — weak
  // Im: no classical bulge (Kormendy & Kennicutt 2004). The Magellanic bar
  // that carries an irregular's central light is geometry this generator does
  // not build, so there is nowhere to put it but the disc.
  { stage: 10, bulge: 0, bar: 0, halo: 0.03 },
];

function rowAt(stage: number): StageRow {
  const rows = DECOMPOSITION_BY_STAGE;
  const above = rows.findIndex((row) => row.stage >= stage);
  if (above <= 0) return above === 0 ? rows[0]! : rows[rows.length - 1]!;
  const lo = rows[above - 1]!;
  const hi = rows[above]!;
  const t = (stage - lo.stage) / (hi.stage - lo.stage);
  return {
    stage,
    bulge: lerp(lo.bulge, hi.bulge, t),
    bar: lerp(lo.bar, hi.bar, t),
    halo: lerp(lo.halo, hi.halo, t),
  };
}

export function galaxyLightDecomposition(
  category: GalaxyCategory,
  params: GalaxyParams,
): GalaxyLightDecomposition {
  const row = rowAt(hubbleStageOf(params.type));
  // Asked at unit radius, so this is the same predicate `pushBar` and
  // `carveStarLayout` gate their geometry on — including a `barred` preset
  // whose `barStrength` is 0, which builds no bar and must be lit as none.
  const bar = barLengthOf(category, 1, params.shared.barStrength) > 0 ? row.bar : 0;
  const disc = 1 - row.bulge - bar - row.halo;
  return category === 'elliptical'
    ? { bulge: row.bulge + disc, bar, disc: 0, halo: row.halo }
    : { bulge: row.bulge, bar, disc, halo: row.halo };
}
