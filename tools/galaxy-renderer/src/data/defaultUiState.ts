/**
 * DEFAULT_UI_STATE — the boot app-chrome state: which control-panel sections
 * start expanded, no copy/paste feedback message yet, auto-rotate off.
 */

import type { UiState } from '../../@types/state/UiState';

export const DEFAULT_UI_STATE: UiState = {
  // The generator-era sections start COLLAPSED, the flux-field-era ones
  // EXPANDED: the current work is the analytic field and the sections being
  // built beside it, and eight open legacy sections push those below the fold.
  openSections: {
    morphology: false,
    shape: false,
    // Its own section, and doomed: the star bag is scheduled for deletion,
    // and giving its budget knob a section makes the eventual removal a
    // section delete instead of a surgical slider extraction.
    starBudget: false,
    arms: true,
    // Expanded: this is the current work, same as `field`/`ringTuning` below.
    armField: true,
    pop: false,
    dust: false,
    glob: false,
    render: false,
    // The analytic-field spike starts EXPANDED: its two toggles are the
    // comparison the section exists for, and a collapsed section would hide
    // the only way to see either half alone.
    field: true,
    // The ring-tuning sliders start expanded for the same reason: this is the
    // whole point of the section, not a settings drawer to tuck away.
    ringTuning: true,
    // Expanded: its live readout is the only place the fade's two factors are
    // visible, and a collapsed section would let the cloud dim with no
    // explanation on screen.
    fade: true,
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
