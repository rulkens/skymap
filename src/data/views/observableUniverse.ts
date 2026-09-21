/**
 * observableUniverse — PLACEHOLDER pose and copy. The pose awaits the user's
 * "copy view pose" capture (debug panel, free orbit only); the words are
 * theirs to write. Both are stand-ins, not defaults to build on.
 */

import type { View } from '../../@types/views/View';

export const observableUniverse: View = {
  id: 'observableUniverse',
  label: 'Observable Universe',
  settings: {},
  pose: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 14000 },
  lede: 'Coming soon — the user writes this view’s copy.',
  body: [
    {
      kind: 'prose',
      heading: 'Observable Universe',
      text: 'Coming soon — the user writes this view’s copy.',
    },
  ],
};
