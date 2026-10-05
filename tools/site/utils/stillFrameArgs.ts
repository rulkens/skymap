import type { HeroStill } from '../@types/HeroStill';

/** ffmpeg arguments for one lossless PNG frame at `still.atSec`; sharp then encodes the WebP. */
export function stillFrameArgs(still: HeroStill, input: string, output: string): string[] {
  return [
    '-y',
    '-ss',
    String(still.atSec),
    '-i',
    input,
    '-frames:v',
    '1',
    '-vf',
    `scale=${still.width}:-2:flags=lanczos,format=rgb24`,
    output,
  ];
}
