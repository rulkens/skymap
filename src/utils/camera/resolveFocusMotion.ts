import type { FocusMotion } from '../../@types/camera/FocusMotion';
import type { FocusMoveSettings } from '../../@types/settings/FocusMoveSettings';

/**
 * resolveFocusMotion — the one place the focus-move Intent becomes the frozen
 * `motion` a tween descriptor carries. The Eased ease is not a setting.
 */
export function resolveFocusMotion(settings: FocusMoveSettings, fovYRad: number): FocusMotion {
  switch (settings.style) {
    case 'eased':
      return { style: 'eased', durationMs: settings.eased.durationMs, ease: 'easeOutCubic' };
    case 'geodesic':
      return { style: 'geodesic', tuning: settings.geodesic, fovYRad };
  }
}
