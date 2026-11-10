/** The Zone of Avoidance exhibit's tuned values: what it forces on, what takes clicks, and the pose. */

import { initialState as milkyWayInitialState } from '../../../layers/milkyWay/state/milkyWay/initialState';
import { initialState as zoneOfAvoidanceInitialState } from '../../../layers/zoneOfAvoidance/state/zoneOfAvoidance/initialState';
import type { CameraPose } from '../../../@types/camera/pose/CameraPose';

// Forced on: a viewer who switched the band off in the panel would otherwise arrive at nothing.
export const BAND_ON = { ...zoneOfAvoidanceInitialState, enabled: true };

// Without the disc there is nothing to read the gap against.
export const MILKY_WAY_WITH_MARKER = { ...milkyWayInitialState, enabled: true, labelEnabled: true };

// Only the band and the galaxies take clicks; any other hit opens a card the copy never mentions.
export const PICK_BAND_AND_GALAXIES = {
  off: [
    'structure',
    'milkyWay',
    'body',
    'craft',
    'starCatalog',
    'blackHole',
    'satellite',
    'stellarStream',
  ],
};

/**
 * Eye 20° above the galactic plane on the ANTICENTRE side, aiming at the centre where the wedge
 * is 10° wide, not 3° (`ZONE_OF_AVOIDANCE_SHELL`). Derived via `orbitAnglesLookingAlong`, never a
 * hand-rolled inverse; POSITIVE pitch is above the plane (`pitch = asin(-forward.y)`, and
 * `-forward` runs target to EYE). Yaw is swung off-centre so the band clears the notes column.
 */
const GALACTIC_LATITUDE_YAW = -3.15;
const GALACTIC_LATITUDE_PITCH = 0.263728;

/**
 * LOAD-BEARING: the band's `veil` window (zoneOfAvoidance/visibility.ts) fades it in from 2 to
 * 10 Milky Way radii (0.035–0.175 Mpc) and out from 2 to 6 Mpc. Owner-framed 2026-11-10 at
 * 0.13 Mpc, just inside the fade-in: the band is not yet at full strength there.
 */
const FRAMING_MPC = 0.13;

export const POSE: CameraPose = {
  target: [0, 0, 0],
  yaw: GALACTIC_LATITUDE_YAW,
  pitch: GALACTIC_LATITUDE_PITCH,
  distance: FRAMING_MPC,
};
