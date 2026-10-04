import type { ControlSchemeId } from '../engine/camera/ControlSchemeId';
import type { NavSettings } from '../camera/NavSettings';

/** CameraControlsSettings — the `settings.cameraControls` cluster: which scheme drives, and its navigator dials. */
export type CameraControlsSettings = { readonly scheme: ControlSchemeId } & NavSettings;
