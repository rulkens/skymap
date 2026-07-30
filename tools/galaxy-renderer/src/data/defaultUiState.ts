/**
 * DEFAULT_UI_STATE — the spike's boot app-chrome state
 * (`Galaxy Renderer.dc.html:467,470`): every control-panel section starts
 * expanded, no copy/paste feedback message yet, auto-rotate off.
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
    // The tool-only grade section starts COLLAPSED, unlike every other
    // section: it holds the three knobs the app has no equivalent for, and a
    // collapsed section is a quieter default than three sliders inviting a
    // departure from app parity.
    grade: false,
    perf: true,
    multi: true,
  },
  copyFeedback: '',
  // Off by default: this tool is the environment for tuning the app's Milky
  // Way star cloud, and A/B comparing two variants means comparing two
  // screenshots of the SAME static frame — a drifting camera makes them
  // incomparable. It also matters for the ms/frame readout: a rotating
  // camera changes how much of the galaxy fills the screen frame to frame,
  // so a spin keeps the frame-time number moving for reasons unrelated to
  // whatever change is being measured.
  autoRotate: false,
};
