import type { StarBody } from '../../scene/StarBody';
import type { PlanetBody } from '../../scene/PlanetBody';
import type { EarthBody } from '../../scene/EarthBody';
import type { FamousStarMetaEntry } from '../../loading/FamousStarMetaEntry';

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
 * `famousStarsMeta` mirrors `GalaxyStore.famousMeta` exactly — same
 * `readonly[]` getter defaulting to `[]`, same wholesale-replace setter —
 * since it is fed by the equivalent slot (`famousStarsMetaSlot`, the star
 * twin of `famousMetaSlot`).
 */
export type BodyStore = {
  /** Seeded stars (chiefly the Sun); empty until the star seed lands. */
  readonly stars: readonly StarBody[];
  /** Seeded planets; empty until the planet seed lands. */
  readonly planets: readonly PlanetBody[];
  /** The descent's landing target; `null` until seeded. */
  readonly earth: EarthBody | null;
  /** Famous-star metadata sidecar; empty until the fetch resolves. */
  readonly famousStarsMeta: readonly FamousStarMetaEntry[];
  /** Replace the star list wholesale. */
  setStars(s: readonly StarBody[]): void;
  /** Replace the planet list wholesale. */
  setPlanets(p: readonly PlanetBody[]): void;
  /** Install (or clear, with `null`) the Earth record. */
  setEarth(e: EarthBody | null): void;
  /** Replace the famous-star meta sidecar wholesale. */
  setFamousStarsMeta(meta: readonly FamousStarMetaEntry[]): void;
};
