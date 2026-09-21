import { describe, expect, it } from 'vitest';

import { buildFfmpegArgs } from '../../../../tools/utils/record/buildFfmpegArgs';

describe('buildFfmpegArgs', () => {
  it('pins the non-dome VideoToolbox argv unchanged', () => {
    expect(buildFfmpegArgs({ fps: 60, out: 'recordings/take.mp4', dome: false })).toEqual([
      '-f',
      'image2pipe',
      '-framerate',
      '60',
      '-i',
      '-',
      '-c:v',
      'h264_videotoolbox',
      '-b:v',
      '60M',
      '-pix_fmt',
      'yuv420p',
      '-y',
      'recordings/take.mp4',
    ]);
  });

  it('dome encode pins the Wisdome H.264 argv', () => {
    // A dropped -level 6.1 or -pix_fmt produces a file that only fails on the
    // venue's player — a partial diff would hide exactly that regression.
    expect(buildFfmpegArgs({ fps: 30, out: 'recordings/dome.mp4', dome: true })).toEqual([
      '-f',
      'image2pipe',
      '-framerate',
      '30',
      '-i',
      '-',
      '-c:v',
      'libx264',
      '-profile:v',
      'main',
      '-level',
      '6.1',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-r',
      '30',
      '-y',
      'recordings/dome.mp4',
    ]);
  });
});
