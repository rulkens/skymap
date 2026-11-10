/** The Cosmic Flows exhibit's tuned values: the speed ramp, the Milky Way marker, the pose and the arrival. */

import { initialState as milkyWayInitialState } from '../../../layers/milkyWay/state/milkyWay/initialState';
import { dollyTo, wait } from '../../../services/engine/animation/effectHelpers';
import type { CameraPose } from '../../../@types/camera/pose/CameraPose';

// The Milky Way stays ON here, label included: that label IS the "you are
// here" marker (`MilkyWaySettings.labelEnabled`), and an exhibit about which
// way we are being carried is unreadable without the "we".
export const MILKY_WAY_WITH_MARKER = { ...milkyWayInitialState, enabled: true, labelEnabled: true };

// The ribbons' own cool→warm speed ramp, sampled at five points from
// `shaders/flow/vertex.wesl`: `mix(COOL, WARM, t) + t²·GLOW`, t = speed /
// SPEED_COLOR_MAX. The glow term is why the hot end whitens rather than staying
// orange, so the legend has to include it or it reads as a different scale.
// Retune those constants and these stops go stale — WESL constants aren't
// importable, so there is no shared source to derive them from.
export const FLOW_SPEED_RAMP = ['#2e6bff', '#6a78d4', '#b695b9', '#ffc2ae', '#ffffb3'];

// Hand-framed (2026-11-10) so the Milky Way, its "You are here" label and
// Andromeda share the opening frame, giving the pull-out a scale to measure against.
export const POSE: CameraPose = { target: [0, 0, 0], yaw: -1.4173, pitch: -0.3041, distance: 0.15 };

// Opens on the local currents, then pulls out around the Milky Way to the
// basin-to-basin scale. The wait lets the flow fade in before the pull.
export const ARRIVAL = [wait(5), dollyTo(300, 5)];
