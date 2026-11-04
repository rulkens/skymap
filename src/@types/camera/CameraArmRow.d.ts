import type { ArmDelta } from './ArmDelta';
import type { CameraArmKind } from './CameraArmKind';
import type { FrameOf } from './FrameOf';
import type { FramedPose } from './FramedPose';
import type { InputStep } from './InputStep';
import type { MemOf } from './MemOf';
import type { PoseOf } from './PoseOf';
import type { CameraArmBasisCtx } from './CameraArmBasisCtx';
import type { CameraArmChannels } from './CameraArmChannels';
import type { CameraArmCtx } from './CameraArmCtx';
import type { HostBody } from './HostBody';
import type { TiltMemory } from './TiltMemory';

/** One arm's table row: its kind, how to resolve its current host body, its empty memory, its channel pair, its input step and its nudge. */
export type CameraArmRow<K extends CameraArmKind> = {
  readonly kind: K;
  /** What the frame tag's value names, for `frameKey`: '' for the world arm, else the body or site id. */
  identity(frame: FrameOf[K]): string;
  host(frame: FrameOf[K], ctx: CameraArmBasisCtx): HostBody | null;
  /** How a clip's four animation channels read in this arm's frame. */
  readonly channels: CameraArmChannels<K>;
  /** Arm-local gesture memory; the runtime wipes it when `frameKey` changes. */
  readonly emptyMemory: MemOf[K];
  /**
   * One input step in this arm's own frame, gesture edges included. A step the
   * arm declines — an unhandled kind, or a notch its floors eat whole —
   * returns `framed.pose` BY REFERENCE; the drain's at-rest notch commit reads
   * that identity as "nothing moved". `tilt` rides beside `memory`
   * rather than inside it: it is keyed by HOST, not by frame (spec §3-P4), so a
   * frame change must not wipe it, and only a tilt-authoring drag writes it.
   */
  step(
    memory: MemOf[K],
    tilt: TiltMemory,
    framed: FramedPose<K>,
    input: InputStep,
    ctx: CameraArmCtx,
  ): { readonly pose: PoseOf[K]; readonly memory: MemOf[K]; readonly tilt: TiltMemory };
  /**
   * One frame's pixel-free motion in this arm's own frame, at the equivalent
   * drag's rate. A delta the arm ignores entirely returns `framed.pose` BY
   * REFERENCE, the same identity rule as `step`.
   */
  nudge(
    tilt: TiltMemory,
    framed: FramedPose<K>,
    delta: ArmDelta,
    ctx: CameraArmCtx,
  ): { readonly pose: PoseOf[K]; readonly tilt: TiltMemory };
};
