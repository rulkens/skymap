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
 * capture. The cost is that VideoToolbox has no crf — quality is bought with
 * a bitrate, and one held flat whatever the content, so the number is chosen
 * against the WORST material this renderer makes (dense star fields, which
 * compress like noise). Re-encoding a 4K take down from 200 Mbit/s stays
 * indistinguishable at 60 — 42.5 dB PSNR on a Centaurus-A dust-lane crop at
 * 1:1, and that measured a SECOND generation, so a first-generation take at
 * this rate is better than what was compared. ~1.1 GB per 148 s loop, against
 * 3.5 GB at 200.
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
    '60M',
    '-pix_fmt',
    'yuv420p',
    '-y',
    opts.out,
  ];
}
