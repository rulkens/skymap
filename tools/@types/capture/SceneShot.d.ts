import type { CameraPose } from '../../../src/@types/camera/CameraPose';

/**
 * One framed shot of the scene: where to look, when, and where the file lands.
 * Deliberately knows nothing about palette cards — whoever wants a shot maps
 * their own data onto this.
 */
export type SceneShot = {
  /** `#focus=` id to fly to. */
  focusId: string;
  /** ISO instant, pinned via `#t=` (the same string `#t=` takes). */
  t: string;
  /** Re-applied once the fly-in settles. Exclusive with `phaseDeg`. */
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
