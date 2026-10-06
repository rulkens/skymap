import type { LoopCodec } from '../@types/LoopCodec';
import type { SiteLoopPlan } from '../@types/SiteLoopPlan';

/**
 * ffmpeg arguments that turn a loop's numbered PNG frames into one of its two
 * files. The frames are full-range sRGB; they are converted to limited-range
 * BT.709 and tagged, or the film would sit brighter than the still it replaces
 * in the page. One keyframe for the whole loop: it is played, never seeked.
 */
export function loopVideoArgs(
  plan: Pick<SiteLoopPlan, 'size' | 'fps'>,
  codec: LoopCodec,
  crf: number,
  framePattern: string,
  output: string,
): string[] {
  const scale =
    `scale=${plan.size}:${plan.size}:flags=lanczos:in_range=pc:out_range=tv:` +
    'out_color_matrix=bt709';
  const encoder =
    codec === 'av1'
      ? ['-c:v', 'libsvtav1', '-preset', '3', '-crf', String(crf), '-g', '600']
      : [
          '-c:v',
          'libx264',
          '-preset',
          'veryslow',
          '-crf',
          String(crf),
          '-profile:v',
          'high',
          '-g',
          '600',
          '-movflags',
          '+faststart',
        ];
  return [
    '-y',
    '-framerate',
    String(plan.fps),
    '-i',
    framePattern,
    '-an',
    '-vf',
    `${scale},format=yuv420p`,
    ...encoder,
    '-color_range',
    'tv',
    '-colorspace',
    'bt709',
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
    output,
  ];
}
