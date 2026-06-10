// ── Test-accessible setSourceVisible logic ──────────────────────────────────
//
// `setSourceVisible`'s logic lives at module scope so tests can drive it
// against a partial-state stub without a full GPU engine; the `createEngine`
// closure delegates here.  The `Pick` keeps the signature narrow while still
// accepting the full `EngineState`.
//
// The setter does ONE authoritative thing: it flips the survey's
// `settings.surveys.items[id].enabled` — the single source of truth for
// on/off.  It then fires the fade (fire-and-forget) and recomputes the masks
// via `deriveSourceMasks`.  It does NOT mutate `drawMask`/`pickMask` itself:
// those are derived outputs that `deriveSourceMasks` owns, packed from
// `enabled` + live fade opacity.  Recompute-from-truth replaces the old
// remember-to-flip-the-mask dance, which is why there's no await and no
// last-issued-wins re-read here — the fade registry's last-issued fade and the
// per-frame derive together handle a rapid concurrent toggle.
//
// Does NOT trigger loading: the render loop's `reevaluateDemand` reads the
// freshly-derived drawMask and loads the now-visible survey (and companions)
// next frame, so visibility and loading stay decoupled.

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../@types/engine/EngineCallbacks';
import type { SourceType } from '../../../@types/data/SourceType';
import type { SurveyId } from '../../../@types/engine/data/SurveyId';
import { SOURCE_REGISTRY } from '../../../data/sources';
import { FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from '../../animation/fadeController';
import { deriveSourceMasks } from '../frame/deriveSourceMasks';

export function setSourceVisibleImpl(
  state: Pick<EngineState, 'sources' | 'settings' | 'subsystems'>,
  opts: { cb: Pick<EngineCallbacks, 'sources'> },
  source: SourceType,
  visible: boolean,
): void {
  const { cb } = opts;
  const id = SOURCE_REGISTRY[source].id as SurveyId;
  if (state.settings.surveys.items[id].enabled === visible) return; // no-op
  // Single source of truth: flip the survey's enabled flag.
  state.settings.surveys.items[id].enabled = visible;
  // Fire the fade (fire-and-forget; last-issued wins inside the registry, and
  // deriveSourceMasks keeps the draw bit set while opacity > 0).
  void state.subsystems.fades.fadeTo(
    { kind: 'survey', source },
    visible ? 1 : 0,
    visible ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS,
  );
  // Recompute the masks NOW so the echo + any synchronous reader (e.g. a tier
  // change in the same tick) see fresh intent; the frame loop re-derives anyway.
  deriveSourceMasks(state);
  // Echo INTENT (pickMask = enabled bits, not the fade-tail drawMask) so the
  // React checkbox reflects on/off the instant the user toggles.
  cb.sources?.onMaskChange?.(state.sources.pickMask);
  state.subsystems.scheduler.requestRender();
}

// Test-only alias matching the import name used in tests.
export { setSourceVisibleImpl as setSourceVisibleForTest };
