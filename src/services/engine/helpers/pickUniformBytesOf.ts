/**
 * pickUniformBytesOf — rebuild the point pick uniform as a value, at pick time.
 *
 * The pick pass needs the same 192-byte `Uniforms` image the visual points pass
 * uploads, minus the fields it always overrides. Building it as a side effect of
 * the visual `draw()` would braid pick-camera availability into "the points pass
 * has already drawn this frame" — a frame-ordering coupling — and mirror one
 * renderer's byte layout into engine state.
 *
 * This helper avoids both by rebuilding the buffer from plain values — a
 * `SlabView` (camera), the ready frame `ctx` (`drawPxPerRad`), and `state.settings`
 * (the appearance knobs) — and DELEGATING to `packGalaxyPointUniforms`. Delegating,
 * rather than re-implementing the byte writes, is the whole point: `packGalaxyPointUniforms`
 * stays the single byte-layout truth that the visual pass also calls, so the pick
 * bytes cannot drift from the visual bytes as fields are added or reordered — the
 * drift is structurally impossible, not merely tested-against.
 *
 * This helper is the SINGLE home for shaping the pick image. It produces the
 * COMPLETE pick uniform — every field the pick pass needs is baked in here, so
 * the pick renderer uploads the bytes verbatim with no post-upload patching.
 * The three pick-specific values, all packed by construction:
 *
 *   - `selectedPacked` → `SELECTION_NONE_SENTINEL`: the pick fragment writes its
 *     own hit id, so the visual selection-halo identity is meaningless here.
 *   - `pointSizePx` → `sizePx + PICK_PADDING_PX`: widens the click target for
 *     far-field point-like galaxies without growing the visible sprites.
 *   - `pickPass = 1`: the shared vertex shader skips the visual-only culls
 *     (crossfade-out, intensity floor) so disk-sized galaxies stay pickable.
 *
 * @module
 */

import { packGalaxyPointUniforms } from '../../../utils/gpu/packGalaxyPointUniforms';
import { SELECTION_NONE_SENTINEL } from '../../../data/selectionEncoding';
import { PICK_PADDING_PX } from '../../../data/pickPaddingPx';
import {
  PROCEDURAL_DISK_FADE_START_PX,
  PROCEDURAL_DISK_FADE_END_PX,
} from '../../../data/galaxyLodBands';
import type { SlabView } from '../../../@types/engine/frame/SlabView';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';

/**
 * Pack the COMPLETE point pick uniform for `view`'s slab from the current
 * camera + settings. Byte-identical to the visual points pack for the same
 * inputs apart from the three pick-specific fields baked in here: the
 * none-selection sentinel, the `+PICK_PADDING_PX` point size, and `pickPass = 1`.
 * The pick renderer uploads these bytes verbatim.
 */
export function pickUniformBytesOf(
  view: SlabView,
  ctx: ReadyFrameContext,
  state: EngineState,
): ArrayBuffer {
  const g = state.settings.galaxyCatalogs;
  const bias = state.settings.bias;

  return packGalaxyPointUniforms(
    view.vp,
    view.viewportPx,
    {
      // Widen the click target for far-field point-like galaxies without
      // growing the visible sprites — the pick-only size padding.
      pointSizePx: g.sizePx + PICK_PADDING_PX,
      brightness: g.brightness,
      // Pick fragment writes its own hit id — the visual selection identity is
      // meaningless in the pick pass, so pack "nothing selected".
      selectedPacked: SELECTION_NONE_SENTINEL,
      camPosWorld: view.camPos,
      pxPerRad: ctx.drawPxPerRad,
      // Same provenance state the visual pass packs: a filter culls at the
      // shared vertex stage, so a hidden galaxy must not be clickable either.
      provenance: g.provenance,
      biasMode: bias.mode,
      absMagLimit: bias.absMagLimit,
      depthFadeEnabled: g.depthFade,
      sbScale: g.sbScale,
      sbMax: g.sbMax,
      falloffStrength: g.falloffStrength,
      // Same fade-band source of truth the visual pass reads (kept in one place
      // so points fade-out and disks fade-in bands can't drift apart).
      pxFadeStart: PROCEDURAL_DISK_FADE_START_PX,
      pxFadeEnd: PROCEDURAL_DISK_FADE_END_PX,
    },
    // Pick pass: the shared vertex shader skips crossfade-out + intensity-floor
    // culls so disk-sized galaxies stay pickable.
    1,
  );
}
