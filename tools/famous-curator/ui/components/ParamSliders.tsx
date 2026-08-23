/**
 * ParamSliders — StarNet + Alpha controls + a single Commit button.
 *
 * Slider ranges per spec:
 *   stride       16..512  (snap to power-of-2 — UI snaps, server accepts any int)
 *   upsample     bool
 *   blackPoint   0..50
 *   whitePoint   180..255
 *   gamma        0.3..2.0 (log-scaled track via input[type=range] step=0.05)
 *
 * Commit runs the full save: re-process if crop/starnet dirty, export
 * the four-WebP trio + recipe, then rebuild famous.bin.  The button's
 * label tracks the current step so the maintainer can see which phase
 * is taking time.  data-dirty=true when crop OR starnet is dirty
 * (drives the orange-dot affordance in the stylist's CSS).
 *
 * Why two separate fieldsets?  StarNet and Alpha represent different
 * server round-trips: /api/process (full starnet + alpha) vs
 * /api/process/alpha-only (cheap, ~1 s vs ~30 s).  Grouping them
 * separately visually signals this cost difference to the operator.
 */
import type { StarnetParams, AlphaParams, DirtyFlags } from '../state';

export type CommitPhase = 'idle' | 'processing' | 'exporting' | 'building';

function commitLabel(phase: CommitPhase): string {
  switch (phase) {
    case 'processing':
      return 'Processing…';
    case 'exporting':
      return 'Exporting…';
    case 'building':
      return 'Rebuilding famous.bin…';
    case 'idle':
      return 'Commit';
  }
}

// Stride must be a power of 2 in [16..512].  The user drags a continuous
// slider; we snap the raw value to the nearest legal stride.  This avoids
// presenting a stepped slider (which would be hard to hit on touch) while
// still enforcing the StarNet tile-size constraint.
const SNAP_STRIDES = [16, 32, 64, 128, 256, 512] as const;
function snapStride(v: number): number {
  // Explicit `number` annotation avoids the const-tuple literal union narrowing
  // `best` to `16` on init, which TypeScript would reject when we later assign
  // other elements of the tuple (each a distinct literal type).
  let best: number = SNAP_STRIDES[0]!;
  let bestDist = Math.abs(v - best);
  for (const s of SNAP_STRIDES) {
    const d = Math.abs(v - s);
    if (d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}

export type ParamSlidersProps = {
  starnet: StarnetParams;
  alpha: AlphaParams;
  dirty: DirtyFlags;
  /** True when the maintainer has filled in the required metadata + a source is loaded. */
  canCommit: boolean;
  /** Current step of an in-flight Commit, or 'idle' when nothing is running. */
  commitPhase: CommitPhase;
  onStarnet: (p: StarnetParams) => void;
  onAlpha: (p: AlphaParams) => void;
  onCommit: () => void;
};

export function ParamSliders(props: ParamSlidersProps) {
  // Process is dirty if the crop or starnet params have changed since the
  // last server round-trip.  Alpha-only dirtiness doesn't block Export
  // (alpha re-runs at export time), but it does mean the preview is stale.
  const processDirty = props.dirty.crop || props.dirty.starnet;

  return (
    <section className="curator-param-sliders">
      <fieldset>
        <legend>StarNet</legend>
        <label>
          stride <span>{props.starnet.stride}</span>
          <input
            aria-label="stride"
            type="range"
            min="16"
            max="512"
            step="1"
            value={props.starnet.stride}
            onChange={(e) =>
              props.onStarnet({ ...props.starnet, stride: snapStride(Number(e.target.value)) })
            }
          />
        </label>
        <label>
          <input
            aria-label="upsample"
            type="checkbox"
            checked={props.starnet.upsample}
            onChange={(e) => props.onStarnet({ ...props.starnet, upsample: e.target.checked })}
          />
          upsample
        </label>
      </fieldset>
      <fieldset>
        <legend>Alpha</legend>
        <label>
          black point <span>{props.alpha.blackPoint}</span>
          <input
            aria-label="black point"
            type="range"
            min="0"
            max="50"
            step="1"
            value={props.alpha.blackPoint}
            onChange={(e) => props.onAlpha({ ...props.alpha, blackPoint: Number(e.target.value) })}
          />
        </label>
        <label>
          white point <span>{props.alpha.whitePoint}</span>
          <input
            aria-label="white point"
            type="range"
            min="180"
            max="255"
            step="1"
            value={props.alpha.whitePoint}
            onChange={(e) => props.onAlpha({ ...props.alpha, whitePoint: Number(e.target.value) })}
          />
        </label>
        <label>
          gamma <span>{props.alpha.gamma.toFixed(2)}</span>
          <input
            aria-label="gamma"
            type="range"
            min="0.3"
            max="2.0"
            step="0.05"
            value={props.alpha.gamma}
            onChange={(e) => props.onAlpha({ ...props.alpha, gamma: Number(e.target.value) })}
          />
        </label>
      </fieldset>
      <div className="curator-param-actions">
        {/* data-dirty drives the orange-dot affordance in the stylesheet.
            Always "true" or "false" (never omitted) so CSS
            [data-dirty="true"] selectors work unconditionally. */}
        <button
          onClick={props.onCommit}
          data-dirty={String(processDirty)}
          disabled={!props.canCommit || props.commitPhase !== 'idle'}
        >
          {props.commitPhase !== 'idle' ? (
            <span className="curator-spinner" aria-hidden="true" />
          ) : null}
          {commitLabel(props.commitPhase)}
        </button>
      </div>
    </section>
  );
}
