import { describe, expect, it } from 'vitest';

import { stellarStreamsFocus } from '../../../../../src/layers/stellarStreams/streaks/present/stellarStreamsFocus';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../../src/data/selectionEncoding';
import { STRONG_RECESSION } from '../../../../../src/data/strongRecession';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import { STREAM_META } from '../../fixtures/streamMeta';

const STREAM_CODE = 9;
const GD_1_INDEX = 1;
const ctxOf = (focusPickId: number | null, focusBlend: number) =>
  ({ snapshot: { focusPickId, focusBlend } }) as unknown as FrameView;
const streamWord = (index: number) => packSelection(STREAM_CODE, index + PICK_SENTINEL_OFFSET);

describe('stellarStreamsFocus', () => {
  it('at rest no stream is focused, none recedes and none brightens', () => {
    expect(stellarStreamsFocus(ctxOf(null, 0), STREAM_CODE, STREAM_META)).toEqual({
      recede: 1,
      focusedStream: -1,
      focusBoost: 1,
    });
  });

  it('a focused stream is named by its index and brightens by its own boost while the rest take the strong recession', () => {
    expect(stellarStreamsFocus(ctxOf(streamWord(GD_1_INDEX), 1), STREAM_CODE, STREAM_META)).toEqual(
      {
        recede: STRONG_RECESSION,
        focusedStream: GD_1_INDEX,
        focusBoost: STREAM_META[GD_1_INDEX]!.focusBoost,
      },
    );
  });

  it('the boost ramps with the focus blend, from 1 at blend 0', () => {
    const at = (blend: number) =>
      stellarStreamsFocus(ctxOf(streamWord(GD_1_INDEX), blend), STREAM_CODE, STREAM_META)
        .focusBoost;
    expect(at(0)).toBe(1);
    expect(at(0.5)).toBeCloseTo((1 + STREAM_META[GD_1_INDEX]!.focusBoost) / 2, 6);
  });

  it('another kind’s focus recedes every stream, its index naming none and brightening none', () => {
    const structureWord = packSelection(STREAM_CODE + 1, GD_1_INDEX + PICK_SENTINEL_OFFSET);
    expect(stellarStreamsFocus(ctxOf(structureWord, 1), STREAM_CODE, STREAM_META)).toEqual({
      recede: STRONG_RECESSION,
      focusedStream: -1,
      focusBoost: 1,
    });
  });
});
