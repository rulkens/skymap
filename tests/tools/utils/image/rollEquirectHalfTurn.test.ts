import { describe, expect, it } from 'vitest';

import { rollEquirectHalfTurn } from '../../../../tools/utils/image/rollEquirectHalfTurn';

describe('rollEquirectHalfTurn', () => {
  it('moves the centre column to the left edge, per row, keeping pixels whole', () => {
    // 4×2, 2 channels: pixel value = 10·column + channel, row 1 offset by 100.
    const px = (row: number, col: number) => [100 * row + 10 * col, 100 * row + 10 * col + 1];
    const src = Buffer.from([0, 1].flatMap((r) => [0, 1, 2, 3].flatMap((c) => px(r, c))));

    const out = rollEquirectHalfTurn(src, 4, 2, 2);

    expect([...out]).toEqual([0, 1].flatMap((r) => [2, 3, 0, 1].flatMap((c) => px(r, c))));
  });
});
