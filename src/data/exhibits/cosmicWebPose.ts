/**
 * The Cosmic Web exhibit's framing, in its own module so a clip can reuse it
 * without importing the exhibit's overlay components.
 */

import type { CameraPose } from '../../@types/camera/CameraPose';

// User-framed and verified live 2026-09-18 (docs/grill-sessions/search-palette-tabs-2026-09-18.md,
// "Capture spike findings"): no focus, target/yaw/pitch/distance below.
export const COSMIC_WEB_POSE: CameraPose = {
  target: [-181.2045404245461, -29.471262938089055, 52.200784784155374],
  yaw: -3.93753522022247,
  pitch: 0.4135452242339458,
  distance: 251.18526964731848,
};
