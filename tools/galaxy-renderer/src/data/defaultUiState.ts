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
    // The two top-level model groups default OPEN regardless of the
    // generator-era/flux-field-era split below: folding them would hide
    // every section's own open state behind an extra click on every boot.
    analyticModel: true,
    legacyModel: true,
    morphology: false,
    shape: false,
    // Its own section, and doomed: the star bag is scheduled for deletion,
    // and giving its budget knob a section makes the eventual removal a
    // section delete instead of a surgical slider extraction.
    starBudget: false,
    arms: true,
    // Collapsed: both are tuned and no longer the active work — the panel is
    // long enough that only what is being calibrated right now earns a slot.
    armField: false,
    armCloud: false,
    hii: false,
    // Nested under HII REGIONS (CollapsibleSection's `nested` prop) — own
    // open state so folding the parent doesn't fight these for the same key
    // (the `armField`/`armCloud` sibling precedent, prefixed instead since
    // these three are nested rather than siblings). Shells starts open: its
    // sliders used to render unconditionally in HII REGIONS' own body.
    hiiShells: true,
    hiiDig: false,
    hiiAssociations: false,
    // Collapsed for the same reason `hii` is: two calibrated knobs, not the
    // active work.
    starFormation: false,
    // The only section expanded by default: the SF map is the current work,
    // and everything else on the panel is either tuned or downstream of it.
    sfMap: true,
    // Nested under SF MAP (CollapsibleSection's `nested` prop), own open
    // state so folding the parent doesn't fight these for the same key —
    // the `hiiDig`/`hiiAssociations` precedent. Only one of the two ever
    // renders at a time (the generator dropdown is now exclusive), but each
    // keeps its own fold state for whenever it's the one showing. Fluid
    // expanded, since it's the default `sfMap.generator`; automaton collapsed.
    sfMapAutomaton: false,
    sfMapFluid: true,
    // Collapsed: the crossfade sliders default to 0 (pure galaxy), so this
    // section is an occasional A/B tool, not something tuned every session.
    debugViews: false,
    pop: false,
    dust: false,
    // Expanded, same rationale as `armField`/`field`: the analytic dust lane
    // is the current work, not a settings drawer to tuck away.
    analyticDust: true,
    // Expanded, same rationale as `analyticDust`: the particle cloud is the
    // current work.
    dustCloud: true,
    glob: false,
    render: false,
    // FLUX FIELD (exposure, part toggles, ring tuning) starts EXPANDED for the
    // same reason `armField` does: this is the current work, not a settings
    // drawer to tuck away.
    field: true,
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
