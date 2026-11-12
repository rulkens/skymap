/**
 * create — the Kepler solver, the dot renderer that reads its rows, then the two slots; the demand
 * loop decides when either loads, and the catalog's commit uploads into the solver.
 */
import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { AsteroidsRuntime } from './@types/AsteroidsRuntime';
import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { createAsteroidsSlot } from './catalog/load/asteroidsSlot';
import { createAsteroidNamesSlot } from './catalog/load/asteroidNamesSlot';
import { createAsteroidKeplerSolver } from './kepler/render/asteroidKeplerSolver';
import { createAsteroidPointRenderer } from './points/render/asteroidPointRenderer';
import AsteroidCatalogWorker from './catalog/load/parseAsteroidCatalog.worker?worker';

export function create(deps: LayerCoreDeps): AsteroidsRuntime {
  const solver = createAsteroidKeplerSolver(deps.ctx.device);
  return {
    slot: createAsteroidsSlot(AsteroidCatalogWorker, solver),
    namesSlot: createAsteroidNamesSlot(),
    solver,
    renderer: createAsteroidPointRenderer({
      device: deps.ctx.device,
      targetFormat: HDR_TARGET_FORMAT,
      pickCode: deps.pickCode('asteroid'),
      solver,
    }),
  };
}
