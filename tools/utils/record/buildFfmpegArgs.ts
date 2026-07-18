/**
 * buildFfmpegArgs — the pinned ffmpeg argv for encoding a recorded tour take.
 *
 * The recorder streams rendered frames to ffmpeg over a pipe (`image2pipe` on
 * stdin, `-i -`) rather than writing PNGs to disk first — a take can run to
 * tens of thousands of frames, and round-tripping each one through the
 * filesystem would multiply both disk I/O and wall time for no benefit; the
 * frames only ever need to exist once, as encoded video. The codec settings
 * (`libx264`, `crf 16`, `preset slow`, `yuv420p`) are a fixed constant, not a
 * caller option: a "quality" flag would let each take drift from the last,
 * making before/after comparisons across the tour's evolution unreliable.
 * `-y` overwrites the output path unprompted, since the recorder is a batch
 * tool with no one at the terminal to answer ffmpeg's "overwrite?" prompt.
 */
export function buildFfmpegArgs(opts: { fps: number; out: string }): string[] {
  return [
    '-f',
    'image2pipe',
    '-framerate',
    String(opts.fps),
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
    opts.out,
  ];
}
