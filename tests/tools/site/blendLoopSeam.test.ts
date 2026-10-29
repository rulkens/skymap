import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';

import { blendLoopSeam } from '../../../tools/site/utils/blendLoopSeam';

let dir = '';
afterEach(() => rmSync(dir, { recursive: true, force: true }));

// One grey pixel per frame, its level the frame's number times ten.
async function recording(frames: number): Promise<void> {
  dir = mkdtempSync(join(tmpdir(), 'seam-'));
  for (let n = 0; n < frames; n++) {
    await sharp({
      create: { width: 1, height: 1, channels: 3, background: { r: n * 10, g: n * 10, b: n * 10 } },
    })
      .png()
      .toFile(join(dir, `${String(n).padStart(4, '0')}.png`));
  }
}
const level = async (n: number) =>
  (
    await sharp(join(dir, `${String(n).padStart(4, '0')}.png`))
      .raw()
      .toBuffer()
  )[0];

describe('blendLoopSeam', () => {
  it('begins on the frame that follows the last and leaves the rest as recorded', async () => {
    await recording(14); // 10 frames and a 4-frame seam
    await blendLoopSeam(dir, 10, 4);
    expect(await level(0)).toBe(100); // frame 10, the one after the last
    expect(await level(2)).toBe(70); // halfway between frame 12 (120) and frame 2 (20)
    expect(await level(4)).toBe(40);
    expect(await level(9)).toBe(90);
  });

  it('deletes the frames it blended from', async () => {
    await recording(14);
    await blendLoopSeam(dir, 10, 4);
    expect(existsSync(join(dir, '0009.png'))).toBe(true);
    expect(existsSync(join(dir, '0010.png'))).toBe(false);
  });
});
