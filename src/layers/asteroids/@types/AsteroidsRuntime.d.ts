/**
 * The asteroids Layer's runtime: the catalog's slot (names included), the Kepler solver the catalog
 * commits into, the dot renderer that reads the solver's rows, and the orbit-ring renderer (its own
 * instance, not core's).
 */
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { OrbitTrailRenderer } from '../../../@types/rendering/orbitTrailRenderer/OrbitTrailRenderer';
import type { LoadedAsteroids } from '../catalog/@types/LoadedAsteroids';
import type { AsteroidKeplerSolver } from '../kepler/@types/AsteroidKeplerSolver';
import type { AsteroidPointRenderer } from '../points/@types/AsteroidPointRenderer';

export type AsteroidsRuntime = {
  readonly slot: AssetSlot<LoadedAsteroids, void>;
  readonly solver: AsteroidKeplerSolver;
  readonly renderer: AsteroidPointRenderer;
  readonly orbitRenderer: OrbitTrailRenderer;
  /** The Layer's pick code; the dot stamp and the selection row both pack it. */
  readonly pickCode: number;
};
