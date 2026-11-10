/** The Cosmic Web exhibit's tuned values: the volumes it switches on, the key's ramp and the pose. */

import { initialState as volumesInitialState } from '../../../layers/cosmicWebDensity/state/cosmicWebDensity/initialState';
import type { CameraPose } from '../../../@types/camera/pose/CameraPose';

// The 2MRS Polyphorm run rides with MCPM here: same quantity, but an all-sky
// footprint where MCPM only covers the SDSS wedge, so the web closes up behind
// the viewer. It boots off (a panel toggle), so the exhibit turns it on
// explicitly, indexed straight out of the boot seed — `items` is complete by
// type, so no default-rebuild is needed.
export const VOLUMES_WITH_2MRS = {
  ...volumesInitialState,
  items: {
    ...volumesInitialState.items,
    'polyphorm-2mrs': { ...volumesInitialState.items['polyphorm-2mrs'], enabled: true },
  },
};

// Matplotlib's inferno, six stops — the same ramp the filament volume samples,
// so the legend reads as the field's own colours rather than a lookalike.
export const INFERNO_RAMP = ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf'];

// User-framed and verified live 2026-09-18 (docs/grill-sessions/search-palette-tabs-2026-09-18.md,
// "Capture spike findings"): no focus, target/yaw/pitch/distance below.
export const POSE: CameraPose = {
  target: [-181.2045404245461, -29.471262938089055, 52.200784784155374],
  yaw: -3.93753522022247,
  pitch: 0.4135452242339458,
  distance: 251.18526964731848,
};
