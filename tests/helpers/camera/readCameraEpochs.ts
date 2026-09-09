/**
 * readCameraEpochs — the five camera epochs as the `{ startMs, refNull }` cells
 * the driver golden fixture pins. The fixture's cell shape is frozen; how the
 * runtime stores an epoch is not, so that mapping lives here and nowhere else.
 */

import type { EngineState } from '../../../src/@types/engine/state/EngineState';

export type EpochCell = { readonly startMs: number | null; readonly refNull: boolean };

export type EpochCells = Readonly<
  Record<'tween' | 'frameTween' | 'autoRotate' | 'follow' | 'clip', EpochCell>
>;

export function readCameraEpochs(state: EngineState): EpochCells {
  const clock = state.cameraRuntime.clock;
  return {
    tween: { startMs: clock.tweenStartMs, refNull: clock.lastTweenRef === null },
    frameTween: { startMs: clock.frameTweenStartMs, refNull: clock.lastFrameTweenRef === null },
    // The autoRotate row's reset reference is `active ? base : null`: the active
    // bit carries the nullness, `lastBaseRef` only the identity inside it.
    autoRotate: { startMs: clock.autoRotateStartMs, refNull: !clock.lastAutoRotateActive },
    follow: { startMs: clock.followStartMs, refNull: clock.lastFollowRef === null },
    clip: { startMs: clock.clipStartMs, refNull: clock.lastClipRef === null },
  };
}
