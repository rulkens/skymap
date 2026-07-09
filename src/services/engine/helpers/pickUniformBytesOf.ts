/**
 * pickUniformBytesOf — rebuild the point pick uniform as a value, at pick time.
 *
 * The pick pass needs the same 176-byte `Uniforms` image the visual points pass
 * uploads, minus the fields it always overrides. Building it as a side effect of
 * the visual `draw()` would braid pick-camera availability into "the points pass
 * has already drawn this frame" — a frame-ordering coupling — and mirror one
 * renderer's byte layout into engine state.
 *
 * This helper avoids both by rebuilding the buffer from plain values — a
 * `SlabView` (camera), the ready frame `ctx` (`drawPxPerRad`), and `state.settings`
 * (the appearance knobs) — and DELEGATING to `packPointUniforms`. Delegating,
 * rather than re-implementing the byte writes, is the whole point: `packPointUniforms`
 * stays the single byte-layout truth that the visual pass also calls, so the pick
 * bytes cannot drift from the visual bytes as fields are added or reordered — the
 * drift is structurally impossible, not merely tested-against.
 *
 * The one deliberate difference from a visual pack is `selectedPacked`: the pick
 * fragment writes its own hit id, so the visual selection-halo identity is
 * meaningless here and we pack the `SELECTION_NONE_SENTINEL`. The remaining two
 * pick overrides — the `+PICK_PADDING_PX` point-size bump and `pickPass = 1` — are applied by the
 * pick renderer AFTER upload, exactly as before; this helper produces the clean
 * visual-shaped starting point.
 *
 * @module
 */

import { packPointUniforms } from '../../../utils/gpu/packPointUniforms';
import { SELECTION_NONE_SENTINEL } from '../../../data/selectionEncoding';
import {
  PROCEDURAL_DISK_FADE_START_PX,
  PROCEDURAL_DISK_FADE_END_PX,
} from '../../../data/galaxyLodBands';
import type { SlabView } from '../../../@types/engine/frame/SlabView';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';

/**
 * Pack a fresh point pick uniform for `view`'s slab from the current camera +
 * settings. Byte-identical to the visual points pack for the same inputs apart
 * from `selectedPacked` (the none-sentinel here). The pick renderer applies its
 * point-size padding + `pickPass = 1` overrides after uploading these bytes.
 */
export function pickUniformBytesOf(
  view: SlabView,
  ctx: ReadyFrameContext,
  state: EngineState,
): ArrayBuffer {
  const g = state.settings.galaxyCatalogs;
  const bias = state.settings.bias;

  return packPointUniforms(view.vp, view.viewportPx, {
    pointSizePx: g.sizePx,
    brightness: g.brightness,
    // Pick fragment writes its own hit id — the visual selection identity is
    // meaningless in the pick pass, so pack "nothing selected".
    selectedPacked: SELECTION_NONE_SENTINEL,
    camPosWorld: view.camPos,
    pxPerRad: ctx.drawPxPerRad,
    highlightFallback: g.highlightFallback,
    realOnlyMode: g.realOnly,
    biasMode: bias.mode,
    absMagLimit: bias.absMagLimit,
    depthFadeEnabled: g.depthFade,
    // Same fade-band source of truth the visual pass reads (kept in one place
    // so points fade-out and disks fade-in bands can't drift apart).
    pxFadeStart: PROCEDURAL_DISK_FADE_START_PX,
    pxFadeEnd: PROCEDURAL_DISK_FADE_END_PX,
  });
}
