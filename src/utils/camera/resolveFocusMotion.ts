import type { FocusMotion } from '../../@types/camera/FocusMotion';
import type { FocusMoveSettings } from '../../@types/settings/FocusMoveSettings';
import { EASED_FOCUS_EASE } from '../../data/camera/focusMoveDefaults';

/**
 * resolveFocusMotion — the one place the focus-move Intent becomes the frozen
 * `motion` a tween descriptor carries.
 */
export function resolveFocusMotion(settings: FocusMoveSettings, fovYRad: number): FocusMotion {
  switch (settings.style) {
    case 'eased':
      return { style: 'eased', durationMs: settings.eased.durationMs, ease: EASED_FOCUS_EASE };
    case 'geodesic':
      return { style: 'geodesic', tuning: settings.geodesic, fovYRad };
  }
}
