/**
 * molehillsSource — the antique Earth map's molehills (sign kind 8) from ETOPO
 * 2022: reveal levels 0–4 worldwide, level 5 over Europe only, where the map's
 * engraved detail goes deepest. Hills come out north first: a sign's glyph
 * stands above its anchor, so a southern hill, lower on the plate, must paint
 * over its northern neighbour's foot.
 */

import type { AntiqueMapPiece } from '../@types/AntiqueMapPiece';
import type { BakedSign } from '../@types/BakedSign';
import type { MolehillLevelPlan } from '../@types/MolehillLevelPlan';
import type { HeightSource } from '../../../textures/@types/HeightSource';
import { EARTH_DATUM_RADIUS_M } from '../../../../src/data/bodies/earthDatumRadiusM';
import { placeMolehills } from '../utils/placeMolehills';

const SIGN_KIND_MOLEHILL = 8;
/** Level-0 spacing: hills sit 16 print units apart once their level is fully in (detail L + 1). */
const SPACING_KM0 = 133;
/** Antarctica is left off: an ice dome, no hills a 1690 engraver drew. */
const WORLD = { west: -180, east: 180, south: -60, north: 90 } as const;
const EUROPE = { west: -12, east: 45, south: 34, north: 72 } as const;
/**
 * Height posts per level: z6 4.9 km, z7 2.4 km, z8 1.2 km. A finer grid finds
 * more crests over the same threshold: worldwide level 4 at z8 added 163k
 * hills, over budget, so it reads z7 and only Europe's level 5 reads z8.
 */
const PLANS: readonly MolehillLevelPlan[] = [
  { level: 0, z: 6, box: WORLD },
  { level: 1, z: 6, box: WORLD },
  { level: 2, z: 6, box: WORLD },
  { level: 3, z: 7, box: WORLD },
  { level: 4, z: 7, box: WORLD },
  { level: 5, z: 8, box: EUROPE },
];
/** Hill budgets: the worldwide levels, and what the European level may add on top. */
const WORLD_BUDGET = 180_000;
const EUROPE_BUDGET = 60_000;
const EUROPE_LEVEL = 5;
const SIZE_UNITS_MIN = 12;
const SIZE_UNITS_SPAN = 14;

export async function molehillsSource(heights: HeightSource): Promise<AntiqueMapPiece> {
  const placed = await placeMolehills(heights, PLANS, {
    spacingKm0: SPACING_KM0,
    radiusKm: EARTH_DATUM_RADIUS_M / 1000,
    onLevel: (level, candidates, added) =>
      console.log(`molehills: level ${level}, ${candidates} crests, ${added} hills added`),
  });
  const world = placed.filter((hill) => hill.level < EUROPE_LEVEL);
  const europe = placed.filter((hill) => hill.level === EUROPE_LEVEL);
  if (world.length > WORLD_BUDGET) {
    throw new Error(`molehills: ${world.length} worldwide hills, over the ${WORLD_BUDGET} budget`);
  }
  // Over budget, Europe's finest level is dropped whole: cutting it short would leave its lowest-relief ground bare.
  const kept = europe.length <= EUROPE_BUDGET ? placed : world;
  if (kept === world)
    console.log(
      `molehills: level 5 dropped, ${europe.length} hills over the ${EUROPE_BUDGET} budget`,
    );

  const signs: BakedSign[] = [...kept]
    .sort((a, b) => b.latDeg - a.latDeg)
    .map((hill) => ({
      lonDeg: hill.lonDeg,
      latDeg: hill.latDeg,
      sizeUnits: SIZE_UNITS_MIN + SIZE_UNITS_SPAN * hill.importance,
      kind: SIGN_KIND_MOLEHILL,
      level: hill.level,
    }));
  return { signs };
}
