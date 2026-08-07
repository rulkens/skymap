/**
 * UiState — app chrome state that lives in the store because it's Intent,
 * not derived: which control-panel sections are expanded, the last
 * copy/paste-JSON feedback message, and the auto-rotate toggle (a camera
 * *behaviour* intent, not a camera pose — the pose itself stays outside the
 * store, driven per frame).
 */

export type UiState = {
  readonly openSections: Readonly<
    Record<
      | 'analyticModel'
      | 'legacyModel'
      | 'morphology'
      | 'shape'
      | 'starBudget'
      | 'arms'
      | 'armField'
      | 'armCloud'
      | 'armSpurs'
      | 'hii'
      | 'hiiShells'
      | 'hiiDig'
      | 'hiiAssociations'
      | 'ismMap'
      | 'ismMapAutomaton'
      | 'ismMapFluid'
      | 'debugViews'
      | 'pop'
      | 'dust'
      | 'analyticDust'
      | 'dustCloud'
      | 'glob'
      | 'render'
      | 'field'
      | 'fade'
      | 'grade'
      | 'perf'
      | 'multi',
      boolean
    >
  >; // all true, as in the spike
  readonly copyFeedback: string; // '' | 'copied ✓' | 'failed' | 'loaded ✓' | 'invalid'
  readonly autoRotate: boolean; // default true; engine toggle intent (not pose) so it lives in the store
};
