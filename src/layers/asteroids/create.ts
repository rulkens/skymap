/**
 * create — the Kepler solver, the dot renderer that reads its rows, then the slot; the demand loop
 * decides when it loads, and its commit uploads into the solver. `catalogReady` flips after the slot
 * settles, never inside commit, so a pending selection re-extracted on that pulse finds the rows.
 */
import type { LayerCoreDeps } from '../../@types/engine/layer/LayerCoreDeps';
import type { AsteroidsFacts } from './@types/AsteroidsFacts';
import type { AsteroidsRuntime } from './@types/AsteroidsRuntime';
import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { createAsteroidsSlot } from './catalog/load/asteroidsSlot';
import { createAsteroidKeplerSolver } from './kepler/render/asteroidKeplerSolver';
import { createAsteroidPointRenderer } from './points/render/asteroidPointRenderer';
import { createOrbitTrailRenderer } from '../../services/gpu/renderers/bodies/orbitTrailRenderer';
import AsteroidCatalogWorker from './catalog/load/parseAsteroidCatalog.worker?worker';

export function create(deps: LayerCoreDeps<AsteroidsFacts>): AsteroidsRuntime {
  const solver = createAsteroidKeplerSolver(deps.ctx.device);
  const pickCode = deps.pickCode('asteroid');
  const slot = createAsteroidsSlot(AsteroidCatalogWorker, solver);
  let catalogReady = false;
  slot.subscribe(() => {
    if ((slot.committed() !== null) === catalogReady) return;
    catalogReady = !catalogReady;
    deps.publish({ catalogReady });
  });
  return {
    slot,
    solver,
    renderer: createAsteroidPointRenderer({
      device: deps.ctx.device,
      targetFormat: HDR_TARGET_FORMAT,
      pickCode,
      solver,
    }),
    orbitRenderer: createOrbitTrailRenderer(deps.ctx.device, HDR_TARGET_FORMAT),
    pickCode,
  };
}
