/**
 * The body Layer: owns the body settings clusters (`bodies`, `earth`, `orbitTrails`),
 * their visibility entries, the Orbit trails toggle row, the Earth and planet slab rows,
 * and draws Earth, the planets, moons and rings: its own renderers, texture slots,
 * passes and the two atmosphere computes. The shape-model moons draw through core's
 * one mesh handle (the mesh slots stay core's).
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { BODY_SLAB_ROWS } from './present/bodySlabRows';
import { bodyLayerSettings } from './state/slices';
import { bodyVisibility } from './visibility';
import { create } from './create';
import { destroy } from './destroy';
import { earthPass } from './passes/earthPass';
import { surfaceTilesPass } from './passes/surfaceTilesPass';
import { terrainPickMarkerPass } from './passes/terrainPickMarkerPass';
import { cloudShellPass } from './passes/cloudShellPass';
import { planetsPass } from './passes/planetsPass';
import { texturedBodiesPass } from './passes/texturedBodiesPass';
import { ringsPass } from './passes/ringsPass';
import { bodyGlintsPass } from './passes/bodyGlintsPass';
import { atmosphereShellPass } from './passes/atmosphereShellPass';
import { aerialPerspectivePass } from './passes/aerialPerspectivePass';
import { bodyMeshesPass } from './passes/bodyMeshesPass';
import { skyViewCompute } from './computes/skyViewCompute';
import { aerialPerspectiveCompute } from './computes/aerialPerspectiveCompute';
import { bodyAssetRows } from './load/bodyAssetRows';

export const bodyLayer = defineLayer({
  name: 'body',
  settings: bodyLayerSettings,
  visibility: bodyVisibility,
  slabs: BODY_SLAB_ROWS,
  create,
  destroy,
  passes: (runtime) => [
    earthPass(runtime),
    surfaceTilesPass(runtime),
    terrainPickMarkerPass(runtime),
    cloudShellPass(runtime),
    planetsPass(runtime),
    texturedBodiesPass(runtime),
    ringsPass(runtime),
    bodyGlintsPass(runtime),
    atmosphereShellPass(runtime),
    aerialPerspectivePass(runtime),
    bodyMeshesPass,
  ],
  computes: (runtime) => [skyViewCompute(runtime), aerialPerspectiveCompute(runtime)],
  assets: bodyAssetRows,
  ui: [{ slot: 'labelsAndGuides', content: { toggle: 'orbitTrails', label: 'Orbit trails' } }],
});
