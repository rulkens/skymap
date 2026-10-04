/**
 * The store values that survive a reload, one row each. `main.tsx` installs
 * the writer over `PERSISTED_VALUES`; boot-time seeding reads a row directly.
 */
import type { PersistedValue } from '../@types/state/PersistedValue';
import type { CameraControlsSettings } from '../@types/settings/CameraControlsSettings';
import { selectSplashDismissedVersion } from './ui/selectors';
import { selectCameraControls } from './settings/selectors';
import { parseCameraControls } from '../utils/storage/parseCameraControls';

export const SPLASH_SEEN_VERSION: PersistedValue<number | null> = {
  key: 'skymap.splash.seenVersion',
  select: selectSplashDismissedVersion,
  parse: (raw) => {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  },
  serialize: (v) => String(v),
};

// The whole cluster under one key: the slice replaces it by reference on any
// change, which is the identity `persistValues` compares.
export const CAMERA_CONTROLS: PersistedValue<CameraControlsSettings> = {
  key: 'skymap.cameraControls.v1',
  select: selectCameraControls,
  parse: parseCameraControls,
  serialize: (v) => JSON.stringify(v),
};

export const PERSISTED_VALUES = [SPLASH_SEEN_VERSION, CAMERA_CONTROLS] as const;
