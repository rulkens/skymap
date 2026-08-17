/**
 * DEFAULT_COMPARE_STATE — the spike's boot compare-panel session
 * (`Galaxy Renderer.dc.html`): panel closed, reference `'m100'`, no
 * pending view-sync request, and no fit run in progress.
 */

import type { CompareState } from '../../@types/state/CompareState';

export const DEFAULT_COMPARE_STATE: CompareState = {
  open: false,
  activeId: 'm100',
  viewIntent: null,
  fitting: false,
  fitProgress: 0,
  fitScore: null,
  fitNote: '',
  report: null,
  stopRequested: false,
};
