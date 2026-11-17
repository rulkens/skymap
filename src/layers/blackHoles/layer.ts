/**
 * The blackHoles Layer: the scene's supermassive black holes — their registry
 * rows, the `blackHole` selection kind with its `blackhole-` deep links, the
 * palette rows, the InfoCard, the captions and their label setting, the
 * far-field marker and its pick stamp, the lens renderer and pass, the
 * `sky-cubemap` target the lens samples and the sky capture that fills it, one
 * `lens` slab row per hole, and the lens tuning DebugPanel section.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { NEAR0 } from '../../services/engine/frame/slabs';
import { blackHolesLayerSettings } from './state/slices';
import { blackHolesVisibility } from './visibility';
import { BLACK_HOLE_SOURCE_ROWS } from './sources/blackHoleSourceRows';
import { BLACK_HOLES } from './markers/data/blackHoles';
import { create } from './create';
import { destroy } from './destroy';
import { blackHoleLensingPass } from './lensing/passes/blackHoleLensingPass';
import { blackHoleMarkerPass } from './markers/passes/blackHoleMarkerPass';
import { blackHoleSlabRow } from './markers/present/blackHoleSlabRow';
import { blackHoleSelectionRow } from './selection/blackHoleSelectionRow';
import { blackHolesSelectionKinds } from './selection/kinds';
import { blackHoleSearch } from './markers/present/blackHoleSearch';
import { produceBlackHoleCaptions } from './markers/present/produceBlackHoleCaptions';
import { BLACK_HOLE_SKY_CAPTURES } from './lensing/data/blackHoleSkyCaptures';
import { SKY_CUBEMAP_TARGET } from './lensing/render/skyCubemapTarget';
import BlackHoleLensingTuningSectionContainer from './lensing/ui/BlackHoleLensingTuningSectionContainer';
import BlackHoleDetailCard from './markers/ui/BlackHoleDetailCard/BlackHoleDetailCard';
import CompactBlackHoleCard from './markers/ui/CompactBlackHoleCard/CompactBlackHoleCard';

export const blackHolesLayer = defineLayer({
  name: 'blackHoles',
  settings: blackHolesLayerSettings,
  visibility: blackHolesVisibility,
  sources: BLACK_HOLE_SOURCE_ROWS,
  targets: [SKY_CUBEMAP_TARGET],
  skyCaptures: BLACK_HOLE_SKY_CAPTURES,
  slabs: BLACK_HOLES.map(blackHoleSlabRow),
  create,
  destroy,
  passes: (runtime) => [blackHoleLensingPass(runtime), blackHoleMarkerPass(runtime)],
  guides: (runtime) => ({
    screenLabels: [
      {
        slab: NEAR0,
        id: 'blackHoleCaptions',
        label: 'blackHole',
        produceLabels: produceBlackHoleCaptions(runtime.pickCode),
      },
    ],
  }),
  selection: {
    kinds: blackHolesSelectionKinds,
    rows: (runtime) => [blackHoleSelectionRow(runtime.pickCode)],
  },
  search: () => blackHoleSearch(),
  ui: [
    { slot: 'debug', content: BlackHoleLensingTuningSectionContainer },
    {
      slot: 'detailCard',
      content: {
        type: 'blackHole',
        Detail: BlackHoleDetailCard,
        Compact: CompactBlackHoleCard,
      },
    },
  ],
});
