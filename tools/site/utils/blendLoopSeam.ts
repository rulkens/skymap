import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

import { mixFrames } from './mixFrames';

const frameFile = (dir: string, frame: number) =>
  join(dir, `${String(frame).padStart(4, '0')}.png`);
const readFrame = (dir: string, frame: number) =>
  sharp(frameFile(dir, frame)).raw().toBuffer({ resolveWithObject: true });

/**
 * Turns a recording of `count + seam` numbered PNG frames into a loop of `count` that has no jump where it
 * repeats, for a scene that never comes back to where it began: the first `seam` frames fade in from the
 * frames that came after the last, so the film's end runs on into its start. The extra frames are deleted.
 */
export async function blendLoopSeam(dir: string, count: number, seam: number): Promise<void> {
  for (let frame = 0; frame < seam; frame++) {
    const after = await readFrame(dir, count + frame);
    const here = await readFrame(dir, frame);
    const { width, height, channels } = here.info;
    // The frames are in memory by now, so the file can be written over.
    await sharp(mixFrames(after.data, here.data, frame / seam), {
      raw: { width, height, channels },
    })
      .png()
      .toFile(frameFile(dir, frame));
  }
  for (const name of readdirSync(dir)) {
    if (/^\d{4}\.png$/.test(name) && Number(name.slice(0, 4)) >= count) rmSync(join(dir, name));
  }
}
