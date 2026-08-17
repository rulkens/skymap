/**
 * pickUniformBytesOf — the COMPLETE pick uniform rebuilt from values.
 *
 * The helper is now the single home for shaping the pick image: it bakes the
 * three pick-specific fields the pick renderer used to override post-upload —
 * the none-selection sentinel (byte 80), the `+PICK_PADDING_PX` point size
 * (byte 88), and `pickPass = 1` (byte 168). This test proves the consolidation
 * is BEHAVIOUR-NEUTRAL: it reconstructs exactly the bytes the OLD `drawPoints`
 * ended up with (a visual pack + those three overrides applied on top) and
 * asserts the helper's output matches byte-for-byte. Because the reconstruction
 * mirrors the old override end-state at the same offsets, the uploaded pick
 * bytes are provably identical before and after the change.
 *
 * Drift-freedom is preserved: the helper still delegates to `packGalaxyPointUniforms`
 * (the single byte-layout truth the visual pass also uses), so every field but
 * the three pick-shaped ones tracks the visual layout automatically.
 */

import { describe, it, expect } from 'vitest';

import { pickUniformBytesOf } from '../../../../src/services/engine/helpers/pickUniformBytesOf';
import { packGalaxyPointUniforms } from '../../../../src/utils/gpu/packGalaxyPointUniforms';
import { SELECTION_NONE_SENTINEL } from '../../../../src/data/selectionEncoding';
import { PICK_PADDING_PX } from '../../../../src/data/pickPaddingPx';
import {
  SELECTED_PACKED_BYTE_OFFSET,
  POINT_SIZE_BYTE_OFFSET,
  PICK_PASS_BYTE_OFFSET,
} from '../../../../src/services/gpu/renderers/galaxyCatalog/galaxyPointVertexLayout';
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
      provenance: {
        orientation: { highlight: true, filter: 'measured' },
        size: { highlight: false, filter: 'all' },
      },
      depthFade: true,
      sbScale: 8,
      sbMax: 30,
      falloffStrength: 0.8,
    },
    bias: { mode: 1, absMagLimit: -18.25 },
  },
} as unknown as EngineState;

describe('pickUniformBytesOf', () => {
  it('matches the OLD drawPoints end-state byte-for-byte (behaviour-neutral consolidation)', () => {
    // Reconstruct exactly what the OLD `drawPoints` uploaded: a visual pack
    // (unpadded size, an arbitrary non-sentinel selectedPacked, pickPass 0)
    // followed by the three post-upload overrides it applied on top — sentinel
    // at byte 80, padded size at byte 88, pickPass=1 at byte 168. This is the
    // pre-change uploaded image; the helper must reproduce it exactly.
    const expected = packGalaxyPointUniforms(VP, VIEWPORT_PX, {
      pointSizePx: STATE.settings.galaxyCatalogs.sizePx, // UNPADDED — override below
      brightness: STATE.settings.galaxyCatalogs.brightness,
      selectedPacked: 42, // arbitrary — override stamps the sentinel below
      camPosWorld: CAM_POS,
      pxPerRad: PX_PER_RAD,
      provenance: STATE.settings.galaxyCatalogs.provenance,
      biasMode: STATE.settings.bias.mode,
      absMagLimit: STATE.settings.bias.absMagLimit,
      depthFadeEnabled: STATE.settings.galaxyCatalogs.depthFade,
      sbScale: STATE.settings.galaxyCatalogs.sbScale,
      sbMax: STATE.settings.galaxyCatalogs.sbMax,
      falloffStrength: STATE.settings.galaxyCatalogs.falloffStrength,
      pxFadeStart: PROCEDURAL_DISK_FADE_START_PX,
      pxFadeEnd: PROCEDURAL_DISK_FADE_END_PX,
    }); // pickPass defaults to 0 — the override below sets it to 1
    // The three overrides the old `drawPoints` applied after uploading, at the
    // same offsets and with the same integer/float encodings.
    new Uint32Array(expected)[SELECTED_PACKED_BYTE_OFFSET / 4] = SELECTION_NONE_SENTINEL;
    new Float32Array(expected)[POINT_SIZE_BYTE_OFFSET / 4] =
      STATE.settings.galaxyCatalogs.sizePx + PICK_PADDING_PX;
    new Uint32Array(expected)[PICK_PASS_BYTE_OFFSET / 4] = 1;

    const actual = pickUniformBytesOf(VIEW, CTX, STATE);

    expect(new Uint8Array(actual)).toEqual(new Uint8Array(expected));
  });

  it('bakes the three pick-shaped fields at their canonical offsets', () => {
    const buf = pickUniformBytesOf(VIEW, CTX, STATE);
    // selectedPacked → none-sentinel at byte 80.
    expect(new Uint32Array(buf)[SELECTED_PACKED_BYTE_OFFSET / 4]).toBe(SELECTION_NONE_SENTINEL);
    // pointSizePx → sizePx + PICK_PADDING_PX at byte 88.
    expect(new Float32Array(buf)[POINT_SIZE_BYTE_OFFSET / 4]).toBeCloseTo(
      STATE.settings.galaxyCatalogs.sizePx + PICK_PADDING_PX,
    );
    // pickPass → 1 (u32) at byte 168.
    expect(new Uint32Array(buf)[PICK_PASS_BYTE_OFFSET / 4]).toBe(1);
  });
});
