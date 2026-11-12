/**
 * The asteroids Layer's runtime: the decoded catalog's slot, the names file's slot, the Kepler solver
 * the catalog commits into, and the dot renderer that reads the solver's rows.
 */
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { AsteroidCatalog } from '../catalog/@types/AsteroidCatalog';
import type { AsteroidKeplerSolver } from '../kepler/@types/AsteroidKeplerSolver';
import type { AsteroidPointRenderer } from '../points/@types/AsteroidPointRenderer';

export type AsteroidsRuntime = {
  readonly slot: AssetSlot<AsteroidCatalog, void>;
  /** The raw names file; read on the first palette search. */
  readonly namesSlot: AssetSlot<ArrayBuffer, void>;
  readonly solver: AsteroidKeplerSolver;
  readonly renderer: AsteroidPointRenderer;
};
