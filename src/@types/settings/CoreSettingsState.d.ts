/**
 * CoreSettingsState — the settings clusters core owns, as against the ones each
 * Layer owns. Every cluster's shape lives in its own file and each slice types
 * its `initialState` from there, so this composition cannot drift from them.
 */

import type { OrientationFrameId } from '../camera/OrientationFrameId';
import type { CameraSettings } from './CameraSettings';
import type { TonemapSettings } from './TonemapSettings';
import type { HdrSettings } from './HdrSettings';
import type { BloomSettings } from './BloomSettings';
import type { LabelSettings } from './LabelSettings';
import type { DebugSettings } from './DebugSettings';

export type CoreSettingsState = {
  /** Which pole the camera calls "up". World positions never move: J2000 always. */
  orientation: OrientationFrameId;
  camera: CameraSettings;
  tonemap: TonemapSettings;
  hdr: HdrSettings;
  bloom: BloomSettings;
  /** Cross-cutting label knobs — they MULTIPLY on top of per-layer label gates. */
  labels: LabelSettings;
  debug: DebugSettings;
};
