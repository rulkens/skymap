/**
 * galaxyPointDrawSettingsOf — the point draw settings the sprites and aggregates passes
 * both hand their renderers, from one view, ctx, state and handed fade; only the
 * selection halo's packed id differs per caller (a flat index or a pool row).
 */

import type { SlabView } from '../../../@types/engine/frame/SlabView';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FadeValueOf } from '../../../@types/animation/FadeValueOf';
import type { SourceType } from '../../../@types/data/SourceType';
import type { GalaxyPointDrawSettings } from '../../../@types/rendering/GalaxyPointDrawSettings';
import { galaxyCatalogIdOf } from '../../../utils/galaxyCatalogIdOf';
import {
  PROCEDURAL_DISK_FADE_START_PX,
  PROCEDURAL_DISK_FADE_END_PX,
} from '../../../data/galaxyLodBands';

export function galaxyPointDrawSettingsOf(
  view: SlabView,
  ctx: FrameView,
  state: PassState,
  fade: FadeValueOf<'survey'>,
  selectedPacked: number,
  focusBindGroup: GPUBindGroup,
): GalaxyPointDrawSettings {
  const g = state.settings.galaxyCatalogs;
  return {
    viewSlot: ctx.viewSlot,
    pointSizePx: g.sizePx,
    brightness: g.brightness,
    selectedPacked,
    camPosWorld: view.camPos,
    pxPerRad: ctx.drawPxPerRad,
    provenance: g.provenance,
    biasMode: state.settings.bias.mode,
    absMagLimit: state.settings.bias.absMagLimit,
    depthFadeEnabled: g.depthFade,
    sbScale: g.sbScale,
    sbMax: g.sbMax,
    falloffStrength: g.falloffStrength,
    // Same apparent-pixel band the procedural-disk layer fades IN over, from
    // one source of truth: drift between them re-creates the double-bright donut.
    pxFadeStart: PROCEDURAL_DISK_FADE_START_PX,
    pxFadeEnd: PROCEDURAL_DISK_FADE_END_PX,
    // @group(3): the engine owns one focus buffer, written once per frame in
    // renderFrame. At rest (blend 0) the shader multiplier is 1.0.
    focusBindGroup,
    fadeOpacityOf: (source: SourceType) => fade[galaxyCatalogIdOf(source)],
  };
}
