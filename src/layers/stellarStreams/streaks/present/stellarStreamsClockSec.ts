import type { FrameView } from '../../../../@types/engine/frame/FrameView';

/** The streaks' flow clock, wrapped on a multiple of the shader's 8 s loop so f32 never loses the phase. */
export function stellarStreamsClockSec(ctx: FrameView): number {
  return (ctx.snapshot.nowMs / 1000) % 200;
}
