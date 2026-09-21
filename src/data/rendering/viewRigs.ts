/**
 * VIEW_RIGS — every `ViewRigKey`'s roster. `mono` is today's frame: one view,
 * identically the main context, over the four sections in their authored
 * order.
 */

import type { ViewRig } from '../../@types/engine/frame/ViewRig';
import type { ViewRigKey } from '../../@types/engine/frame/ViewRigKey';
import { OVERLAYS, POST, PRELUDE, SCENE } from './frameSections';

export const VIEW_RIGS: Readonly<Record<ViewRigKey, ViewRig>> = {
  mono: {
    // `null`, never `[mainViewSpec(...)]` — see `ViewRig.views`'s doc.
    views: () => null,
    program: [PRELUDE, SCENE, POST, OVERLAYS],
  },
  // Placeholder: `ViewRigKey` needs 'dome' for the `dome-cube` render-target
  // row's `allocateWhen` to typecheck. Nothing sets `state.viewRig` to 'dome'
  // yet, so this never runs; the real face views + program are a later task.
  dome: {
    views: () => null,
    program: [],
  },
};
