import type { HeroMediaPlan } from '../@types/HeroMediaPlan';

/**
 * ffmpeg arguments for the scrub video. Scroll seeks it constantly, so the GOP
 * is one second with scene-cut keyframes off (a seek decodes at most one GOP);
 * `+faststart` lets playback begin before the file has finished arriving.
 * The recording is full-range and tagged BT.601; browsers disagree on
 * full-range H.264, so it is converted to limited-range BT.709 here.
 */
export function scrubVideoArgs(
  plan: Pick<HeroMediaPlan, 'inSec' | 'outSec' | 'width' | 'fps' | 'crf'>,
  input: string,
  output: string,
): string[] {
  const height = Math.round((plan.width * 9) / 16 / 2) * 2;
  const scale =
    `scale=${plan.width}:${height}:flags=lanczos:in_range=pc:out_range=tv:` +
    'in_color_matrix=bt601:out_color_matrix=bt709';
  return [
    '-y',
    '-ss',
    String(plan.inSec),
    '-t',
    String(plan.outSec - plan.inSec),
    '-i',
    input,
    '-an',
    '-vf',
    `fps=${plan.fps},${scale},format=yuv420p`,
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    String(plan.crf),
    '-profile:v',
    'high',
    '-g',
    String(plan.fps),
    '-keyint_min',
    String(plan.fps),
    '-sc_threshold',
    '0',
    '-color_range',
    'tv',
    '-colorspace',
    'bt709',
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
    '-movflags',
    '+faststart',
    output,
  ];
}
