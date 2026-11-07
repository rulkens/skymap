/**
 * printUniformBytesOf — the points `Uniforms` image for the antique print stage,
 * built as a value from the slab view, the frame and the settings, as
 * `pickUniformBytesOf` builds the pick image: the visual pass's own knobs
 * (`pickPass = 0`, no padding), so a galaxy prints at the intensity it draws at.
 */

import { packGalaxyPointUniforms } from './packGalaxyPointUniforms';
import { SELECTION_NONE_SENTINEL } from '../../../../data/selectionEncoding';
import {
  PROCEDURAL_DISK_FADE_START_PX,
  PROCEDURAL_DISK_FADE_END_PX,
} from '../../lod/data/galaxyLodBands';
import type { SlabView } from '../../../../@types/engine/frame/SlabView';
import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../../@types/engine/frame/PassState';

export function printUniformBytesOf(view: SlabView, ctx: FrameView, state: PassState): ArrayBuffer {
  const g = state.settings.galaxyCatalogs;
  return packGalaxyPointUniforms(view.vp, view.viewportPx, {
    pointSizePx: g.sizePx,
    brightness: g.brightness,
    selectedPacked: SELECTION_NONE_SENTINEL,
    camPosWorld: view.camPos,
    pxPerRad: ctx.drawPxPerRad,
    provenance: g.provenance,
    biasMode: state.settings.bias.mode,
    absMagLimit: state.settings.bias.absMagLimit,
    depthFadeEnabled: g.depthFade,
    sbScale: g.sbScale,
    sbMax: g.sbMax,
    falloffStrength: g.falloffStrength,
    pxFadeStart: PROCEDURAL_DISK_FADE_START_PX,
    pxFadeEnd: PROCEDURAL_DISK_FADE_END_PX,
  });
}
