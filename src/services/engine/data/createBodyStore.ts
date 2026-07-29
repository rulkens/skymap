import type { BodyStore } from '../../../@types/engine/data/BodyStore';
import type { StarBody } from '../../../@types/scene/StarBody';
import type { PlanetBody } from '../../../@types/scene/PlanetBody';
import type { EarthBody } from '../../../@types/scene/EarthBody';

/**
 * createBodyStore — factory for the scene-body data store.
 *
 * Same factory-plus-closure shape as `createGalaxyStore` / `createStructureStore`:
 * a plain factory closing over private mutable state rather than a class, since
 * the engine is a singleton and a class would only add a `this.` access pattern.
 * The closure holds the star/planet arrays and the nullable Earth record; the
 * frozen object exposes read-only getters over the live state and mutates only
 * through the setters, which the slot commits own.
 *
 * The store starts empty — no bodies are seeded here. Seeding is a later
 * concern (`sceneBodies.ts` supplies the authored constants, a slot commit
 * installs them), which keeps this factory a pure container with no knowledge
 * of what the scene contains.
 */
export function createBodyStore(): BodyStore {
  let stars: readonly StarBody[] = [];
  let planets: readonly PlanetBody[] = [];
  let earth: EarthBody | null = null;

  return Object.freeze({
    get stars(): readonly StarBody[] {
      return stars;
    },
    get planets(): readonly PlanetBody[] {
      return planets;
    },
    get earth(): EarthBody | null {
      return earth;
    },
    setStars(s: readonly StarBody[]): void {
      stars = s;
    },
    setPlanets(p: readonly PlanetBody[]): void {
      planets = p;
    },
    setEarth(e: EarthBody | null): void {
      earth = e;
    },
  });
}
