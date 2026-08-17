import type { StarBody } from '../../scene/StarBody';
import type { PlanetBody } from '../../scene/PlanetBody';
import type { EarthBody } from '../../scene/EarthBody';

/**
 * BodyStore — the authoritative app-side home for the scene's true-scale
 * foreground bodies (stars, planets, and the special-cased Earth).
 *
 * Sibling of `GalaxyStore` / `StructureStore`: the same factory-plus-closure
 * shape and the same discipline — READ-ONLY views out (`readonly[]` for the
 * collections, a nullable record for Earth), mutation only through the setters,
 * which the slot commits own. These are seeded authored constants
 * (`sceneBodies.ts`), not per-frame state, so the store simply holds whatever
 * the seed installed and hands live views back without defensive copies.
 *
 * The full surface is defined now even though only Earth is seeded in this
 * phase: stars and planets get their seeds in a later phase, and pinning the
 * type here means that seed slots into an already-agreed shape rather than
 * reshaping the store. Earth is a distinct getter (not folded into `planets`)
 * because it is the descent's landing target and carries its own textured
 * `EarthBody` form; it is `null` until seeded.
 *
 * This store holds no metadata sidecar: the famous-star `famous_stars_meta.json`
 * entries are read only by the InfoCard, so its slot reports them to the
 * engine Redux slice instead.
 */
export type BodyStore = {
  /** Seeded stars (chiefly the Sun); empty until the star seed lands. */
  readonly stars: readonly StarBody[];
  /** Seeded planets; empty until the planet seed lands. */
  readonly planets: readonly PlanetBody[];
  /** The descent's landing target; `null` until seeded. */
  readonly earth: EarthBody | null;
  /** Replace the star list wholesale. */
  setStars(s: readonly StarBody[]): void;
  /** Replace the planet list wholesale. */
  setPlanets(p: readonly PlanetBody[]): void;
  /** Install (or clear, with `null`) the Earth record. */
  setEarth(e: EarthBody | null): void;
};
