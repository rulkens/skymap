import type { SceneEffect } from '../SceneEffect';

/**
 * SceneCue — a scene effect fired once when the playback clock crosses `atSec`.
 *
 * Cues in `CompiledClip.cues` are ordered by `atSec` ascending so the cue-firer
 * can advance a cursor linearly as the clock progresses, without scanning the
 * full list each frame.
 */
export type SceneCue = {
  readonly atSec: number;
  readonly effect: SceneEffect;
};
