/**
 * The asteroids Layer's runtime: the catalog's slot (names included), the Kepler solver the catalog
 * commits into, and the dot renderer that reads the solver's rows.
 */
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { LoadedAsteroids } from '../catalog/@types/LoadedAsteroids';
import type { AsteroidKeplerSolver } from '../kepler/@types/AsteroidKeplerSolver';
import type { AsteroidPointRenderer } from '../points/@types/AsteroidPointRenderer';

export type AsteroidsRuntime = {
  readonly slot: AssetSlot<LoadedAsteroids, void>;
  readonly solver: AsteroidKeplerSolver;
  readonly renderer: AsteroidPointRenderer;
  /** The Layer's pick code; the dot stamp and the selection row both pack it. */
  readonly pickCode: number;
};
