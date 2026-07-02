/**
 * UiState — app chrome state that lives in the store because it's Intent,
 * not derived: which control-panel sections are expanded, the last
 * copy/paste-JSON feedback message, and the auto-rotate toggle (a camera
 * *behaviour* intent, not a camera pose — the pose itself stays outside the
 * store, driven per frame).
 */

export type UiState = {
  readonly openSections: Readonly<
    Record<'shape' | 'arms' | 'pop' | 'dust' | 'glob' | 'render' | 'perf' | 'multi', boolean>
  >; // all true — html:470
  readonly copyFeedback: string; // '' | 'copied ✓' | 'failed' | 'loaded ✓' | 'invalid'
  readonly autoRotate: boolean; // default true; engine toggle intent (not pose) so it lives in the store
};
