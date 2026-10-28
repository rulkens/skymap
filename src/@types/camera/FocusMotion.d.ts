import type { Ease } from '../animation/Ease';
import type { GeodesicTuning } from './GeodesicTuning';

/**
 * FocusMotion — how one camera tween flies, frozen onto its descriptor at
 * dispatch so a settings change mid-flight never reshapes a move in progress.
 * `style` picks the `FOCUS_MOTIONS` row that turns it into a clip. The geodesic
 * arm carries `fovYRad` because the path's shape depends on it; freezing it
 * means a FOV drag or resize mid-flight cannot bend the move.
 */
export type FocusMotion =
  | { readonly style: 'eased'; readonly durationMs: number; readonly ease: Ease }
  | { readonly style: 'geodesic'; readonly tuning: GeodesicTuning; readonly fovYRad: number };
