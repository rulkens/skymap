import type { PlanetBody } from '../../scene/PlanetBody';
import type { MeshBody } from '../../scene/MeshBody';
import type { EarthBody } from '../../scene/EarthBody';

/**
 * BodyStore — the authoritative app-side home for the scene's true-scale
 * foreground bodies (planets, mesh bodies, and the special-cased Earth).
 *
 * Sibling of `StructureStore`: the same factory-plus-closure
 * shape and the same discipline — READ-ONLY views out (`readonly[]` for the
 * collections, a nullable record for Earth), mutation only through the setters,
 * which the slot commits own. These are seeded authored constants
 * (`sceneBodies.ts`), not per-frame state, so the store simply holds whatever
 * the seed installed and hands live views back without defensive copies.
 *
 * The seeded STARS are not here: they are their own star catalogs, walked from
 * `SEEDED_STAR_CATALOGS` by `visibleStars`, which is the only reader a drawn
 * star ever had. Earth is a distinct getter (not folded into `planets`)
 * because it is the descent's landing target and carries its own textured
 * `EarthBody` form; it is `null` until seeded.
 *
 * This store holds no metadata sidecar: the famous-star `famous_stars_meta.json`
 * entries are read only by the InfoCard, so its slot reports them to the
 * engine Redux slice instead.
 */
export type BodyStore = {
  /** Seeded planets; empty until the planet seed lands. */
  readonly planets: readonly PlanetBody[];
  /** Seeded mesh bodies; empty until the mesh seed lands. */
  readonly meshBodies: readonly MeshBody[];
  /** The descent's landing target; `null` until seeded. */
  readonly earth: EarthBody | null;
  /** Replace the planet list wholesale. */
  setPlanets(p: readonly PlanetBody[]): void;
  /** Replace the mesh-body list wholesale. */
  setMeshBodies(m: readonly MeshBody[]): void;
  /** Install (or clear, with `null`) the Earth record. */
  setEarth(e: EarthBody | null): void;
};
