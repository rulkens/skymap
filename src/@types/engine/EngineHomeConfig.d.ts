import type { Mat3 } from '../math/Mat3';
import type { InitialCam } from '../camera/InitialCam';
import type { HomeFocusTarget } from './HomeFocusTarget';

/**
 * EngineHomeConfig — a composition's boot-time home, threaded into
 * `wireInput` instead of the Earth default it used to hard-code. `pose` stays
 * a function (not a snapshot) because the boot instant and orientation basis
 * are only known once `wireInput` runs.
 */
export type EngineHomeConfig = {
  /**
   * The boot camera framing. A function, not a snapshot: it is evaluated in
   * `wireInput` against the live boot instant and the committed orientation basis.
   */
  readonly pose: (boot: { readonly simDays: number; readonly frameBasis: Mat3 }) => InitialCam;
  /** The home target, seeded into the focus slot. `null` = this composition has no home. */
  readonly focus: HomeFocusTarget | null;
  /** Whether the home target is also seeded into the SELECT slot (the ring + InfoCard). */
  readonly seedSelection: () => boolean;
};
