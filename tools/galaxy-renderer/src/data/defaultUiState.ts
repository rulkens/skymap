/**
 * DEFAULT_UI_STATE — the spike's boot app-chrome state
 * (`Galaxy Renderer.dc.html:467,470`): every control-panel section starts
 * expanded, no copy/paste feedback message yet, auto-rotate on.
 */

import type { UiState } from '../../@types/state/UiState';

export const DEFAULT_UI_STATE: UiState = {
  openSections: {
    shape: true,
    arms: true,
    pop: true,
    dust: true,
    glob: true,
    render: true,
    perf: true,
    multi: true,
  },
  copyFeedback: '',
  autoRotate: true,
};
