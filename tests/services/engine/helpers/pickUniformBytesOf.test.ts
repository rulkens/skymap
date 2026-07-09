/**
 * pickUniformBytesOf — the pick uniform rebuilt from values.
 *
 * The load-bearing property is DRIFT-FREEDOM: because the helper delegates to
 * `packPointUniforms` (the single byte-layout truth the visual pass also uses),
 * the pick buffer is byte-identical to a visual-pass pack apart from the one
 * field the pick pass always overrode — `selectedPacked`, which becomes the
 * `SELECTION_NONE_SENTINEL` (the pick fragment writes its own hit id, so the
 * visual selection halo is meaningless here). The first test pins exactly that:
 * pack the same camera/settings directly, overwrite `u32[20]` (byte 80) with the
 * sentinel, and assert the bytes match. The second nails the sentinel's offset.
 */

import { describe, it, expect } from 'vitest';

import { pickUniformBytesOf } from '../../../../src/services/engine/helpers/pickUniformBytesOf';
import { packPointUniforms } from '../../../../src/utils/gpu/packPointUniforms';
import { SELECTION_NONE_SENTINEL } from '../../../../src/data/selectionEncoding';
import {
  PROCEDURAL_DISK_FADE_START_PX,
  PROCEDURAL_DISK_FADE_END_PX,
} from '../../../../src/data/galaxyLodBands';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

// Distinct, non-round sentinel values per slot so a mis-mapped field would
// perturb a byte the equality check would catch.
const VP = new Float32Array([
  1.1, 2.2, 3.3, 4.4, 5.5, 6.6, 7.7, 8.8, 9.9, 10.1, 11.2, 12.3, 13.4, 14.5, 15.6, 16.7,
]);
const VIEWPORT_PX: [number, number] = [1920, 1080];
const CAM_POS: [number, number, number] = [123.5, -456.25, 789.125];
const PX_PER_RAD = 640.75;

const VIEW: SlabView = {
  slab: {} as unknown as SlabView['slab'],
  vp: VP,
  camPos: CAM_POS,
  viewportPx: VIEWPORT_PX,
};

const CTX = { drawPxPerRad: PX_PER_RAD } as unknown as ReadyFrameContext;

const STATE = {
  settings: {
    galaxyCatalogs: {
      sizePx: 5.5,
      brightness: 0.8,
      highlightFallback: true,
      realOnly: false,
      depthFade: true,
    },
    bias: { mode: 1, absMagLimit: -18.25 },
  },
} as unknown as EngineState;

describe('pickUniformBytesOf', () => {
  it('matches the visual packer byte-for-byte apart from selectedPacked', () => {
    // Pack the SAME camera + settings through the visual packer, with a
    // deliberately non-sentinel selectedPacked (42) to prove the overwrite is
    // load-bearing, then stamp the none-sentinel in at u32[20].
    const expected = packPointUniforms(VP, VIEWPORT_PX, {
      pointSizePx: STATE.settings.galaxyCatalogs.sizePx,
      brightness: STATE.settings.galaxyCatalogs.brightness,
      selectedPacked: 42,
      camPosWorld: CAM_POS,
      pxPerRad: PX_PER_RAD,
      highlightFallback: STATE.settings.galaxyCatalogs.highlightFallback,
      realOnlyMode: STATE.settings.galaxyCatalogs.realOnly,
      biasMode: STATE.settings.bias.mode,
      absMagLimit: STATE.settings.bias.absMagLimit,
      depthFadeEnabled: STATE.settings.galaxyCatalogs.depthFade,
      pxFadeStart: PROCEDURAL_DISK_FADE_START_PX,
      pxFadeEnd: PROCEDURAL_DISK_FADE_END_PX,
    });
    new Uint32Array(expected)[20] = SELECTION_NONE_SENTINEL;

    const actual = pickUniformBytesOf(VIEW, CTX, STATE);

    expect(new Uint8Array(actual)).toEqual(new Uint8Array(expected));
  });

  it('packs the none-sentinel at byte 80', () => {
    const buf = pickUniformBytesOf(VIEW, CTX, STATE);
    // Byte 80 === u32 index 20 — the selectedPacked slot.
    expect(new Uint32Array(buf)[20]).toBe(SELECTION_NONE_SENTINEL);
  });
});
