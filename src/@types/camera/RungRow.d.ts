import type { RungKind } from './RungKind';
import type { FrameOf } from './FrameOf';
import type { FramedPose } from './FramedPose';
import type { InputStep } from './InputStep';
import type { MemOf } from './MemOf';
import type { PoseOf } from './PoseOf';
import type { RungBasisCtx } from './RungBasisCtx';
import type { RungChannels } from './RungChannels';
import type { RungCtx } from './RungCtx';
import type { HostBody } from './HostBody';
import type { TiltMemory } from './TiltMemory';

/** One rung's table row: its kind, how to resolve its current host body, its empty memory, its channel pair, its input step. */
export type RungRow<K extends RungKind> = {
  readonly kind: K;
  host(frame: FrameOf[K], ctx: RungBasisCtx): HostBody | null;
  /** How a clip's four animation channels read in this rung's frame. */
  readonly channels: RungChannels<K>;
  /** Rung-local gesture memory; the runtime wipes it when `frameKey` changes. */
  readonly emptyMemory: MemOf[K];
  /**
   * One input step in this rung's own frame, gesture edges included. A kind the
   * rung declines returns `framed.pose` BY REFERENCE — the drain's at-rest notch
   * commit reads that identity as "nothing moved". `tilt` rides beside `memory`
   * rather than inside it: it is keyed by HOST, not by frame (spec §3-P4), so a
   * frame change must not wipe it, and only a tilt-authoring drag writes it.
   */
  step(
    memory: MemOf[K],
    tilt: TiltMemory,
    framed: FramedPose<K>,
    input: InputStep,
    ctx: RungCtx,
  ): { readonly pose: PoseOf[K]; readonly memory: MemOf[K]; readonly tilt: TiltMemory };
};
