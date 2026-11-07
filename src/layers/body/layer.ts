/**
 * The body Layer: owns the body settings clusters (`bodies`, `earth`, `orbitTrails`),
 * their visibility entries, the Orbit trails toggle row, the Earth, planet and moon
 * body rows with their source rows, the `body` selection kind and card, palette rows,
 * name captions, the antique globe's place names, orbit trails, the Solar System exhibit
 * and the Earth and planet slab rows. It draws Earth, the planets, moons and rings: its
 * own renderers, texture slots, passes and the two atmosphere computes. It streams and
 * plans the surface tiles, is the ground core's camera reads, and publishes the tile
 * readouts. Shape-model moons draw through core's one mesh handle (its mesh slots).
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { BODY_SLAB_ROWS } from './slabs/present/bodySlabRows';
import { bodyLayerSettings } from './state/slices';
import { bodyVisibility } from './visibility';
import { create } from './create';
import { destroy } from './destroy';
import { earthPass } from './earth/passes/earthPass';
import { earthOceanMaskPass } from './earth/passes/earthOceanMaskPass';
import { bodySeaMaskPass } from './spheres/passes/bodySeaMaskPass';
import { surfaceTilesPass } from './surfaceTiles/patch/passes/surfaceTilesPass';
import { terrainPickMarkerPass } from './terrainPick/passes/terrainPickMarkerPass';
import { cloudShellPass } from './clouds/passes/cloudShellPass';
import { planetsPass } from './spheres/passes/planetsPass';
import { texturedBodiesPass } from './spheres/passes/texturedBodiesPass';
import { ringsPass } from './rings/passes/ringsPass';
import { bodyGlintsPass } from './glints/passes/bodyGlintsPass';
import { atmosphereShellPass } from './atmosphere/passes/atmosphereShellPass';
import { aerialPerspectivePass } from './atmosphere/passes/aerialPerspectivePass';
import { atmosphereProbeSkyPass } from './atmosphere/passes/atmosphereProbeSkyPass';
import { atmosphereProbeShellPass } from './atmosphere/passes/atmosphereProbeShellPass';
import { bodyMeshesPass } from './meshes/passes/bodyMeshesPass';
import { skyViewCompute } from './atmosphere/computes/skyViewCompute';
import { atmosphereRosterPlanner } from './atmosphere/present/atmosphereRosterPlanner';
import { aerialPerspectiveCompute } from './atmosphere/computes/aerialPerspectiveCompute';
import { bodyAssetRows } from './textures/load/bodyAssetRows';
import { BODY_BODY_ROWS } from './bodies/bodyBodyRows';
import { BODY_SOURCE_ROWS } from './sources/bodySourceRows';
import { bodySelectionRow } from './selection/bodySelectionRow';
import { bodySelectionKinds } from './selection/kinds';
import { bodySearch } from './selection/present/bodySearch';
import { BODY_TRAIL_ELEMENTS } from './orbitTrails/data/bodyTrailElements';
import { SMALL_BODY_TRAIL_IDS } from './orbitTrails/data/smallBodyTrailIds';
import { produceSceneBodyCaptions } from './labels/present/produceSceneBodyCaptions';
import { produceAntiqueEarthPlaces } from './labels/present/produceAntiqueEarthPlaces';
import { bodyLayerExhibits } from './exhibits/exhibits';
import { NEAR0 } from '../../services/engine/frame/slabs';
import BodyDetailCardContainer from './card/ui/BodyDetailCardContainer';
import CompactBodyCard from '../../components/InfoCard/CompactBodyCard/CompactBodyCard';
import { surfaceTilePlanner } from './frame';
import { watchDebugPanelWakeSaga } from './surfaceTiles/debug/sagas/watchDebugPanelWakeSaga';
import { heightAt } from './heightAt';
import { EMPTY_SURFACE_TILE_DEBUG_SNAPSHOT } from './surfaceTiles/stream/subsystems/surfaceTileStream';
import { NO_TERRAIN_PICK_MARKER_READOUT } from './terrainPick/present/terrainPickMarkerReadoutOf';
import SurfaceTileAtlasSectionContainer from './surfaceTiles/debug/ui/SurfaceTileAtlasSectionContainer';
import TerrainPickMarkerTuningSectionContainer from './terrainPick/ui/TerrainPickMarkerTuningSectionContainer';
import EarthTuningSectionContainer from './earth/ui/EarthTuningSectionContainer';
import type { BodyFacts } from './@types/BodyFacts';

export const bodyLayer = defineLayer({
  name: 'body',
  settings: bodyLayerSettings,
  bodies: BODY_BODY_ROWS,
  sources: BODY_SOURCE_ROWS,
  visibility: bodyVisibility,
  exhibits: bodyLayerExhibits,
  slabs: BODY_SLAB_ROWS,
  facts: {
    surfaceTileDebug: EMPTY_SURFACE_TILE_DEBUG_SNAPSHOT,
    terrainPickMarker: NO_TERRAIN_PICK_MARKER_READOUT,
  } as BodyFacts,
  create,
  destroy,
  passes: (runtime) => [
    earthPass(runtime),
    earthOceanMaskPass(runtime),
    surfaceTilesPass(runtime),
    terrainPickMarkerPass(runtime),
    cloudShellPass(runtime),
    planetsPass(runtime),
    texturedBodiesPass(runtime),
    bodySeaMaskPass(runtime),
    ringsPass(runtime),
    bodyGlintsPass(runtime),
    atmosphereShellPass(runtime),
    aerialPerspectivePass(runtime),
    atmosphereProbeSkyPass(runtime),
    atmosphereProbeShellPass(runtime),
    bodyMeshesPass(runtime),
  ],
  computes: (runtime) => [skyViewCompute(runtime), aerialPerspectiveCompute(runtime)],
  assets: bodyAssetRows,
  planners: (runtime) => [surfaceTilePlanner(runtime), atmosphereRosterPlanner],
  sagas: [watchDebugPanelWakeSaga],
  heightAt,
  guides: (runtime) => ({
    screenLabels: [
      {
        slab: NEAR0,
        id: 'sceneBodyCaptions',
        label: 'body',
        produceLabels: produceSceneBodyCaptions(runtime.pickCodes),
      },
      {
        slab: NEAR0,
        id: 'antiqueEarthPlaces',
        label: 'body',
        produceLabels: produceAntiqueEarthPlaces(runtime.pickCodes),
      },
    ],
    orbitTrails: {
      show: 'orbitTrails',
      rows: BODY_TRAIL_ELEMENTS,
      selectedOnly: SMALL_BODY_TRAIL_IDS,
    },
  }),
  selection: { kinds: bodySelectionKinds, rows: (runtime) => [bodySelectionRow(runtime)] },
  search: () => bodySearch(),
  ui: [
    { slot: 'labelsAndGuides', content: { toggle: 'orbitTrails', label: 'Orbit trails' } },
    { slot: 'debug', content: SurfaceTileAtlasSectionContainer },
    { slot: 'debug', content: TerrainPickMarkerTuningSectionContainer },
    { slot: 'debug', content: EarthTuningSectionContainer },
    {
      slot: 'detailCard',
      content: { type: 'body', Detail: BodyDetailCardContainer, Compact: CompactBodyCard },
    },
  ],
});
