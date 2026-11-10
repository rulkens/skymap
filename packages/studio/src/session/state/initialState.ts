/** The studio slice before any clip opens; its selectors read this until the slice's first action lands. */
import type { StudioState } from '../../@types/session/StudioState';

export const initialState: StudioState = {
  clipId: null,
  baseline: null,
  draft: null,
  revision: 0,
  preview: null,
  resolution: null,
  selection: null,
  collapsed: [],
  playheadSec: 0,
  viewport: null,
  history: { past: [], future: [] },
};
