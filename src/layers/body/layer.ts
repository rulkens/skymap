/**
 * The body Layer: owns the body settings clusters (`bodies`, `earth`, `orbitTrails`),
 * their visibility entries, the Orbit trails toggle row, the Earth, planet and moon
 * body rows with their source rows, the `body` selection kind and card, palette rows,
 * name captions, orbit trails, the Solar System exhibit and the Earth and planet slab
 * rows. It draws Earth, the planets, moons and rings: its own renderers, texture slots,
 * passes and the two atmosphere computes. The shape-model moons draw through core's
 * one mesh handle (the mesh slots stay core's); the surface-tile plan and subsystem stay core's.
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
import { BODY_BODY_ROWS } from './bodies/bodyBodyRows';
import { BODY_SOURCE_ROWS } from './sources/bodySourceRows';
import { bodySelectionRow } from './present/bodySelectionRow';
import { bodySearch } from './present/bodySearch';
import { BODY_TRAIL_ELEMENTS } from './present/bodyTrailElements';
import { produceSceneBodyCaptions } from './present/produceSceneBodyCaptions';
import { bodyLayerExhibits } from './exhibits/exhibits';
import { NEAR0 } from '../../services/engine/frame/slabs';
import BodyDetailCardContainer from '../../components/containers/BodyDetailCardContainer';
import CompactBodyCard from '../../components/InfoCard/CompactBodyCard/CompactBodyCard';

export const bodyLayer = defineLayer({
  name: 'body',
  settings: bodyLayerSettings,
  bodies: BODY_BODY_ROWS,
  sources: BODY_SOURCE_ROWS,
  visibility: bodyVisibility,
  exhibits: bodyLayerExhibits,
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
  guides: () => ({
    screenLabels: [
      {
        slab: NEAR0,
        id: 'sceneBodyCaptions',
        label: 'body',
        produceLabels: produceSceneBodyCaptions,
      },
    ],
    orbitTrails: { show: 'orbitTrails', rows: BODY_TRAIL_ELEMENTS },
  }),
  selection: () => [bodySelectionRow()],
  search: () => bodySearch(),
  ui: [
    { slot: 'labelsAndGuides', content: { toggle: 'orbitTrails', label: 'Orbit trails' } },
    {
      slot: 'detailCard',
      content: { type: 'body', Detail: BodyDetailCardContainer, Compact: CompactBodyCard },
    },
  ],
});
