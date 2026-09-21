/**
 * View — a `viewRegistry` row: a scene takeover addressed by a pose rather than
 * a focus. `openView` (Task 6) applies `settings` via `mergeSnapshot`, flies to
 * `pose`, and shows `body` in the `ViewOverlay`; `runTakeover` owns restore.
 */

import type { CameraPose } from '../camera/CameraPose';
import type { SettingsSnapshot } from '../engine/settings/SettingsSnapshot';
import type { ViewId } from './ViewId';
import type { ViewSection } from './ViewSection';

export type View = {
  id: ViewId;
  label: string;
  /** Applied through `mergeSnapshot`; the takeover bracket restores it on exit. */
  settings: Partial<SettingsSnapshot>;
  pose: CameraPose;
  body: readonly ViewSection[];
};
