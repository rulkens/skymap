import { describe, it, expect } from 'vitest';
import { waitUntilSettled } from '../../../../src/services/engine/helpers/waitUntilSettled';

describe('waitUntilSettled', () => {
  it('keeps waiting across animating frames and stops at the first still one', async () => {
    const verdicts = [true, true, false, true];
    let frames = 0;
    await waitUntilSettled(
      async () => {
        frames++;
      },
      () => verdicts[frames - 1] ?? false,
    );
    expect(frames).toBe(3);
  });

  it('spends one frame even when nothing animates', async () => {
    let frames = 0;
    await waitUntilSettled(
      async () => {
        frames++;
      },
      () => false,
    );
    expect(frames).toBe(1);
  });
});
