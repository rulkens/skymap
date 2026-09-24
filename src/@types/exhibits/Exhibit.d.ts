/**
 * Exhibit — an `exhibitRegistry` row: a scene takeover addressed by a pose
 * rather than a focus. `openExhibit` applies `settings` via `mergeSnapshot`,
 * flies to `pose`, and shows `body` in the `ExhibitOverlay`; `runTakeoverSaga`
 * owns restore.
 */

import type { CameraPose } from '../camera/CameraPose';
import type { SettingsSnapshot } from '../engine/settings/SettingsSnapshot';
import type { ExhibitId } from './ExhibitId';
import type { ExhibitSection } from './ExhibitSection';

export type Exhibit = {
  id: ExhibitId;
  label: string;
  /** Applied through `mergeSnapshot`; the takeover bracket restores it on exit. */
  settings: Partial<SettingsSnapshot>;
  pose: CameraPose;
  /** When set, `pose.distance` is re-derived at fly time so a sphere of this
   *  radius fits the live viewport — see `sphereFitDistance`. */
  fitRadiusMpc?: number;
  /** The italic line under the title — the exhibit's one-sentence claim. */
  lede: string;
  body: readonly ExhibitSection[];
};
