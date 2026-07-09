/**
 * A precomputed sampling of one clip's camera path, owned by the
 * `clipPathInspector` subsystem and drawn by the clip-path debug pass.
 *
 * Computed ONCE when the user clicks "Calculate" in the debug panel (never per
 * frame, never tied to playback), so the route can be inspected — coloured by
 * speed, scrubbed, framed — from a free camera while nothing is playing.
 */

import type { ClipId } from '../../animation/ClipId';
import type { ClipPathSample } from './ClipPathSample';

export type ClipPathSnapshot = {
  /** The clip this path was sampled from (folded into line ids to force re-upload). */
  readonly clipId: ClipId;
  /** Total clip duration in seconds (the scrubber's upper bound). */
  readonly durationSec: number;
  /** Uniform-in-time samples from t=0 to t=durationSec, length ≥ 2. */
  readonly samples: ReadonlyArray<ClipPathSample>;
};
