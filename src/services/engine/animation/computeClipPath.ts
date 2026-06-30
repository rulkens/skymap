/**
 * computeClipPath — the seam that turns a resolved `ClipData` into a sampled
 * `ClipPathSnapshot` and hands it to the `clipPathInspector` subsystem.
 *
 * This is the debug-overlay analogue of `playClip`: a factory that captures the
 * engine-only deps (the inspector subsystem, a live-pose accessor) in a closure
 * and returns plain callables a saga reads from context. The watch saga resolves
 * the clip's foci (ids → world positions) at the action boundary, then calls
 * `compute(clipId, resolved)` here.
 *
 * ### Why resolve the start pose here, like playClip
 *
 * A clip authored with `start: 'live'` must be pinned to the pose the user
 * currently sees BEFORE sampling, otherwise `evaluateClip` has no concrete
 * origin. We call `resolveClipStart(resolved, getLivePose())` at compute time —
 * the same dispatch-time resolution `playClip` does — so the sampled route
 * begins exactly where a real play would.
 *
 * ### Why compile just for the duration
 *
 * `sampleClipPath` walks the clip uniformly in TIME, so it needs the total
 * duration. `compileClip` already computes `durationSec` as a by-product of
 * flattening the effect tree; we compile once here (cheap, and memoised by clip
 * identity inside `compileClip`) purely to read that scalar.
 */

import { resolveClipStart } from '../../../state/camera/cameraSlice';
import { compileClip } from './compileClip';
import { sampleClipPath } from './sampleClipPath';
import type { ClipData } from '../../../@types/animation/ClipData';
import type { ClipId } from '../../../@types/animation/ClipId';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { ClipPathInspector } from '../../../@types/engine/subsystems/ClipPathInspector';
import type { ClipPathInspectSeam } from '../../../store/types';

export type ClipPathInspectSeamDeps = {
  /** The subsystem that holds the snapshot for the debug pass to read. */
  inspector: ClipPathInspector;
  /**
   * Accessor for the live produced camera pose (the pose the user sees). Read at
   * compute time so a `start: 'live'` clip samples from the current view — same
   * contract as `playClip`'s `getLivePose`.
   */
  getLivePose: () => CameraPose;
  /** How many uniform-in-time samples to take along the path. */
  sampleCount: number;
};

/**
 * Build the bound clip-path inspector seam from its engine dependencies. Call
 * once at bootstrap (after the inspector subsystem + camera runtime exist) and
 * register the result in saga context.
 */
export function createClipPathInspectSeam(deps: ClipPathInspectSeamDeps): ClipPathInspectSeam {
  const { inspector, getLivePose, sampleCount } = deps;

  // The clip the current snapshot was sampled from — fully resolved and pinned
  // to the live pose at compute time. Held here (not in the snapshot, which
  // carries only render geometry) so `watchReplayInspectedPathSaga` can replay
  // the EXACT inspected route rather than a fresh `start: 'live'` resolution.
  let pinned: ClipData | null = null;

  return {
    compute(clipId: ClipId, resolved: ClipData): void {
      const started = resolveClipStart(resolved, getLivePose());
      pinned = started;
      const durationSec = compileClip(started).durationSec;
      inspector.setSnapshot(sampleClipPath(clipId, started, durationSec, sampleCount));
    },
    clear(): void {
      pinned = null;
      inspector.clear();
    },
    pinnedClip(): ClipData | null {
      return pinned;
    },
  };
}
