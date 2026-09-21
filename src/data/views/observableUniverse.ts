/**
 * observableUniverse — PLACEHOLDER copy; the words are the user's to write.
 * The pose is real: `fitRadiusMpc` re-derives `pose.distance` at fly time
 * (`viewBody.ts`) so the horizon shell's whole sphere fits the live viewport
 * at any aspect; `pose.distance` below is only the pre-runtime fallback —
 * the landscape answer at the default 60° FOV (`R / sin(fovY/2)`).
 */

import type { View } from '../../@types/views/View';
import { HORIZON_RADIUS_MPC } from '../rendering/horizonRadiusMpc';

export const observableUniverse: View = {
  id: 'observableUniverse',
  label: 'Observable Universe',
  settings: {},
  fitRadiusMpc: HORIZON_RADIUS_MPC,
  pose: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 28600 },
  lede: 'Coming soon — the user writes this view’s copy.',
  body: [
    {
      kind: 'prose',
      heading: 'Observable Universe',
      text: 'Coming soon — the user writes this view’s copy.',
    },
  ],
};
