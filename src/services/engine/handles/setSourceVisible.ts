// ── Test-accessible setSourceVisible logic ──────────────────────────────────
//
// `setSourceVisible`'s logic lives at module scope so tests can drive it
// against a partial-state stub without a full GPU engine; the `createEngine`
// closure delegates here.  The `Pick` keeps the signature narrow while still
// accepting the full `EngineState`.
//
// Does NOT trigger loading: it flips `drawMask`/`pickMask` and calls
// `requestRender`.  The render loop's `reevaluateDemand` reads the flipped
// drawMask and loads the now-visible survey (and companions) next frame, so
// visibility and loading stay decoupled.

import { maskWith, maskWithout } from '../../../utils/sourceMask';
import type { SourceType } from '../../../@types/data/SourceType';
import { FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from '../../animation/fadeController';
import type { FadeHandle } from '../../../@types/animation/FadeHandle';
import type { EngineCallbacks } from '../../../@types/engine/EngineCallbacks';

export async function setSourceVisibleImpl(
  state: Pick<
    import('../../../@types/engine/state/EngineState').EngineState,
    'sources' | 'subsystems'
  >,
  opts: { cb: Pick<EngineCallbacks, 'sources'> },
  source: SourceType,
  visible: boolean,
): Promise<void> {
  const { cb } = opts;

  const handle: FadeHandle = { kind: 'survey', source };
  const targetMask = visible
    ? maskWith(state.sources.pickMask, source)
    : maskWithout(state.sources.pickMask, source);
  if (targetMask === state.sources.pickMask && targetMask === state.sources.drawMask) return;

  // pickMask flips IMMEDIATELY — a fading-out layer must not be clickable.
  state.sources.pickMask = targetMask;
  // Notify the UI of the (immediate) state change so the checkbox reflects.
  cb.sources?.onMaskChange?.(targetMask);
  state.subsystems.scheduler.requestRender();

  if (visible) {
    // Flip drawMask, then fade in.  `reevaluateDemand` reads the now-set
    // bit and loads the idle survey (plus companions); the idle-guard keeps
    // a loaded survey from re-fetching, so re-toggling is cheap.
    state.sources.drawMask = targetMask;
    await state.subsystems.fades.fadeTo(handle, 1, FADE_IN_DURATION_MS);
  } else {
    await state.subsystems.fades.fadeTo(handle, 0, FADE_OUT_DURATION_MS);
    // Re-read opacity rather than closing over `visible`: a concurrent
    // off→on toggle within the fade-out window may have reversed the fade.
    // Last-issued fade wins — if a fade-in started while we awaited, opacity
    // is > 0 and we leave the drawMask bit set so the renderer keeps
    // drawing through the ramp-up.
    const finalOpacity = state.subsystems.fades.opacityOf(handle);
    if (finalOpacity === 0) {
      state.sources.drawMask = maskWithout(state.sources.drawMask, source);
    } else {
      state.sources.drawMask = maskWith(state.sources.drawMask, source);
    }
  }
  state.subsystems.scheduler.requestRender();
}

// Test-only alias matching the import name used in tests.
export { setSourceVisibleImpl as setSourceVisibleForTest };
