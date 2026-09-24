/**
 * The blackHoles Layer: the scene's supermassive black holes — the lens
 * renderer and pass, the `sky-cubemap` target the lens samples, one `lens`
 * slab row per hole, the lens tuning settings and their DebugPanel section.
 * The sky capture that fills the cubemap stays in core (`CUBEMAP_CAPTURES`).
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { blackHolesLayerSettings } from './state/slices';
import { BLACK_HOLES } from './data/blackHoles';
import { create } from './create';
import { destroy } from './destroy';
import { blackHoleLensingPass } from './passes/blackHoleLensingPass';
import { blackHoleSlabRow } from './present/blackHoleSlabRow';
import { SKY_CUBEMAP_TARGET } from './render/skyCubemapTarget';
import SgrAStarLensingTuningSectionContainer from './ui/SgrAStarLensingTuningSectionContainer';

export const blackHolesLayer = defineLayer({
  name: 'blackHoles',
  settings: blackHolesLayerSettings,
  targets: [SKY_CUBEMAP_TARGET],
  slabs: BLACK_HOLES.map(blackHoleSlabRow),
  create,
  destroy,
  passes: (runtime) => [blackHoleLensingPass(runtime)],
  ui: [{ slot: 'debug', content: SgrAStarLensingTuningSectionContainer }],
});
