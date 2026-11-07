import { describe, expect, it } from 'vitest';

import { stellarStreamsFocus } from '../../../../../src/layers/stellarStreams/streaks/present/stellarStreamsFocus';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../../src/data/selectionEncoding';
import { STRONG_RECESSION } from '../../../../../src/data/strongRecession';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';

const STREAM_CODE = 9;
const ctxOf = (focusPickId: number | null, focusBlend: number) =>
  ({ snapshot: { focusPickId, focusBlend } }) as unknown as FrameView;

describe('stellarStreamsFocus', () => {
  it('at rest no stream is focused and none recedes', () => {
    expect(stellarStreamsFocus(ctxOf(null, 0), STREAM_CODE)).toEqual({
      recede: 1,
      focusedStream: -1,
    });
  });

  it('a focused stream is named by its index while the rest take the strong recession', () => {
    const word = packSelection(STREAM_CODE, 12 + PICK_SENTINEL_OFFSET);
    expect(stellarStreamsFocus(ctxOf(word, 1), STREAM_CODE)).toEqual({
      recede: STRONG_RECESSION,
      focusedStream: 12,
    });
  });

  it('another kind’s focus recedes every stream, its index naming none', () => {
    const structureWord = packSelection(STREAM_CODE + 1, 12 + PICK_SENTINEL_OFFSET);
    expect(stellarStreamsFocus(ctxOf(structureWord, 1), STREAM_CODE)).toEqual({
      recede: STRONG_RECESSION,
      focusedStream: -1,
    });
  });
});
