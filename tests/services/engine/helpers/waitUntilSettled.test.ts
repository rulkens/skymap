import { describe, it, expect } from 'vitest';
import { waitUntilSettled } from '../../../../src/services/engine/helpers/waitUntilSettled';

describe('waitUntilSettled', () => {
  it('keeps waiting until two frames in a row are still', async () => {
    const verdicts = [true, false, true, false, false, true];
    let frames = 0;
    await waitUntilSettled(
      async () => {
        frames++;
      },
      () => verdicts[frames - 1] ?? false,
    );
    expect(frames).toBe(5);
  });

  // A demand turns on the frame after the camera lands: one still frame is not enough.
  it('spends two frames even when nothing moves', async () => {
    let frames = 0;
    await waitUntilSettled(
      async () => {
        frames++;
      },
      () => false,
    );
    expect(frames).toBe(2);
  });
});
