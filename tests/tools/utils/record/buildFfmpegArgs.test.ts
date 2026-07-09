import { describe, expect, it } from 'vitest';
import { buildFfmpegArgs } from '../../../../tools/utils/record/buildFfmpegArgs';

describe('buildFfmpegArgs', () => {
  it('buildFfmpegArgs emits the pinned libx264 image2pipe argv', () => {
    expect(buildFfmpegArgs({ fps: 30, out: 'out.mp4' })).toEqual([
      '-f',
      'image2pipe',
      '-framerate',
      '30',
      '-i',
      '-',
      '-c:v',
      'libx264',
      '-crf',
      '16',
      '-preset',
      'slow',
      '-pix_fmt',
      'yuv420p',
      '-y',
      'out.mp4',
    ]);
  });
});
