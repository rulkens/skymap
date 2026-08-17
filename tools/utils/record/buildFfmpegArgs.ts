/**
 * buildFfmpegArgs — the pinned ffmpeg argv for encoding a recorded tour take.
 *
 * The recorder streams rendered frames to ffmpeg over a pipe (`image2pipe` on
 * stdin, `-i -`) rather than writing PNGs to disk first — a take can run to
 * tens of thousands of frames, and round-tripping each one through the
 * filesystem would multiply both disk I/O and wall time for no benefit; the
 * frames only ever need to exist once, as encoded video.
 *
 * VideoToolbox, not libx264: at 4K60 `libx264 -preset slow -crf 16` encodes
 * ~5 frames/s, well under the ~8 frames/s the capture side sustains, so it
 * became the whole take's clock — 30 min of encoding for 15 min of frames.
 * Apple's hardware encoder runs near realtime and hands the wall back to
 * capture. The cost is that VideoToolbox has no crf: quality is bought with
 * a bitrate, and 200 Mbit/s sits comfortably above the ~166 Mbit/s that
 * crf 16 produced on the densest 4K material this renderer makes.
 *
 * The settings stay a fixed constant rather than a caller option, as they
 * were under x264: a "quality" flag would let each take drift from the last,
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
    'h264_videotoolbox',
    '-b:v',
    '200M',
    '-pix_fmt',
    'yuv420p',
    '-y',
    opts.out,
  ];
}
