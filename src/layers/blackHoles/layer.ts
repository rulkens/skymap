/**
 * The blackHoles Layer: the scene's supermassive black holes — their registry
 * rows, the `blackHole` selection kind with its `blackhole-` deep links, the
 * palette rows, the InfoCard, the captions and their label setting, the
 * far-field marker and its pick stamp, the lens renderer and pass, the
 * `sky-cubemap` target the lens samples, one `lens` slab row per hole, and the
 * lens tuning DebugPanel section. The sky capture that
 * fills the cubemap stays in core (`CUBEMAP_CAPTURES`).
 */

import { createElement } from 'react';
import { defineLayer } from '../../services/engine/layer/defineLayer';
import { NEAR0 } from '../../services/engine/frame/slabs';
import { blackHolesLayerSettings } from './state/slices';
import { BLACK_HOLE_SOURCE_ROWS } from './sources/blackHoleSourceRows';
import { BLACK_HOLES } from './data/blackHoles';
import { create } from './create';
import { destroy } from './destroy';
import { blackHoleLensingPass } from './passes/blackHoleLensingPass';
import { blackHoleMarkerPass } from './passes/blackHoleMarkerPass';
import { blackHoleSlabRow } from './present/blackHoleSlabRow';
import { blackHoleSelectionRow } from './present/blackHoleSelectionRow';
import { blackHoleSearch } from './present/blackHoleSearch';
import { blackHoleFadeRows } from './present/blackHoleFadeRows';
import { produceBlackHoleCaptions } from './present/produceBlackHoleCaptions';
import { SKY_CUBEMAP_TARGET } from './render/skyCubemapTarget';
import SgrAStarLensingTuningSectionContainer from './ui/SgrAStarLensingTuningSectionContainer';
import BlackHoleDetailCard from './ui/BlackHoleDetailCard/BlackHoleDetailCard';
import CompactBlackHoleCard from './ui/CompactBlackHoleCard/CompactBlackHoleCard';

export const blackHolesLayer = defineLayer({
  name: 'blackHoles',
  settings: blackHolesLayerSettings,
  sources: BLACK_HOLE_SOURCE_ROWS,
  targets: [SKY_CUBEMAP_TARGET],
  slabs: BLACK_HOLES.map(blackHoleSlabRow),
  create,
  destroy,
  passes: (runtime) => [blackHoleLensingPass(runtime), blackHoleMarkerPass(runtime)],
  fades: blackHoleFadeRows,
  guides: () => ({
    screenLabels: [
      { slab: NEAR0, id: 'blackHoleCaptions', produceLabels: produceBlackHoleCaptions() },
    ],
  }),
  selection: () => [blackHoleSelectionRow()],
  search: () => blackHoleSearch(),
  ui: [
    { slot: 'debug', content: SgrAStarLensingTuningSectionContainer },
    {
      slot: 'detailCard',
      content: {
        type: 'blackHole',
        Detail: ({ target, pinned, chrome, onFocus, onClose }) =>
          createElement(BlackHoleDetailCard, { target, pinned, chrome, onFocus, onClose }),
        Compact: ({ target }) => createElement(CompactBlackHoleCard, { target }),
      },
    },
  ],
});
