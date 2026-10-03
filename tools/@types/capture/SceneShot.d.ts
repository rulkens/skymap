import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { ExhibitId } from '../../../src/@types/exhibits/ExhibitId';
import type { mergeSnapshot } from '../../../src/state/settings/mergeSnapshotAction';

/**
 * One framed shot of the scene: where to look, when, and where the file lands.
 * Deliberately knows nothing about palette cards — whoever wants a shot maps
 * their own data onto this. `focusId` and `exhibitId` are exclusive — the shot
 * boots on `#focus=` or `#exhibit=`, never both.
 */
export type SceneShot = {
  /** `#focus=` id to fly to; omit to boot with no selection (a view's own frame). */
  focusId?: string;
  /** `#exhibit=` id to open on arrival — its registry settings and pose apply themselves. */
  exhibitId?: ExhibitId;
  /** Merged in on top of whatever the boot (plain, `#focus=` or `#exhibit=`) already applied. */
  settings?: Parameters<typeof mergeSnapshot>[0];
  /** ISO instant, pinned via `#t=` (the same string `#t=` takes). */
  t: string;
  /** Applied once arrival settles — the boot commits once, so nothing overwrites it. Exclusive with `phaseDeg`. */
  pose?: CameraPose;
  /** Frame a focused body at this phase instead; `bodyPhasePose` defines the turn. */
  phaseDeg?: number;
  /** Keep the selection (focus dim) in the shot; default: clear it first. */
  keepFocus?: boolean;
  /** Hide the galaxy catalogs' point cloud — the backdrop on a single galaxy. */
  hideGalaxyField?: boolean;
  /** Where the webp is written. */
  outPath: string;
  /** Names this shot in the log and in any error. */
  label: string;
};
