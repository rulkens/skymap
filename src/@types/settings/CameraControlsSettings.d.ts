/** CameraControlsSettings — the `settings.cameraControls` cluster: which scheme drives, and its navigator dials. */

import type { ControlSchemeId } from '../engine/camera/ControlSchemeId';
import type { NavSettings } from '../camera/NavSettings';

export type CameraControlsSettings = { readonly scheme: ControlSchemeId } & NavSettings;
