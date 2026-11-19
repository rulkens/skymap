/**
 * VIEW_RIGS — every `ViewRigKey`'s roster. `mono` is one view, identically
 * the main context, over the four sections in their authored order. `dome`
 * is five views, one per cube face, resampled into the same canvas `mono`
 * draws to, with the labels drawn once on that image.
 */

import type { ViewRig } from '../../@types/engine/frame/ViewRig';
import type { ViewRigKey } from '../../@types/engine/frame/ViewRigKey';
import { domeFaceSpecs } from '../../utils/camera/viewRig/domeFaceSpecs';
import {
  DOME_OVERLAYS,
  DOME_RESAMPLE,
  OVERLAYS,
  POST,
  PRELUDE,
  SCENE,
  SCENE_TO_DOME_CUBE,
} from './frameSections';

export const VIEW_RIGS: Readonly<Record<ViewRigKey, ViewRig>> = {
  mono: {
    // `null`, never `[mainViewSpec(...)]` — see `ViewRig.views`'s doc.
    views: () => null,
    program: [PRELUDE, SCENE, POST, OVERLAYS],
    pickable: true,
    outputProjection: 'pinhole',
  },
  // Five dome-cube faces, no canvas draw of its own: the resample step reads
  // them back into `hdr`, which `POST` composites to the canvas like mono's
  // own. The overlays then draw on that fisheye image, so the labels' projection
  // is the resample's (spec `completed/2026-11-17-dome-labels-design.md` §7).
  dome: {
    views: domeFaceSpecs,
    program: [PRELUDE, SCENE_TO_DOME_CUBE, DOME_RESAMPLE, POST, DOME_OVERLAYS],
    pickable: false,
    outputProjection: 'equidistant',
  },
};
