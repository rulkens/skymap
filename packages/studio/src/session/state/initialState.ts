/** The studio slice before any clip opens; its selectors read this until the slice's first action lands. */
import type { StudioState } from '../../@types/session/StudioState';

export const initialState: StudioState = {
  clipId: null,
  baseline: null,
  draft: null,
  revision: 0,
  preview: null,
  resolution: null,
  refNames: {},
  pick: null,
  selection: null,
  collapsed: [],
  transport: { kind: 'paused', atSec: 0, camera: 'clip' },
  followedSec: 0,
  loop: false,
  viewport: null,
  history: { past: [], future: [] },
};
