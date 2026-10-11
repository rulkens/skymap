/** ffmpeg arguments for one lossless full-size PNG frame at `atSec`; sharp then crops, scales and encodes it. */
export function stillFrameArgs(atSec: number, input: string, output: string): string[] {
  return ['-y', '-ss', String(atSec), '-i', input, '-frames:v', '1', '-vf', 'format=rgb24', output];
}
