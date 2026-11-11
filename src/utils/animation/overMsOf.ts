import { FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from '../../services/animation/fadeController';
import type { SceneStep } from '../../@types/animation/compiledClip/SceneStep';

/** A step's own `over`, else the fade registry's defaults (600 ms in, 100 ms out). */
export function overMsOf(step: SceneStep, to: number): number {
  const { effect } = step;
  const over = effect.kind === 'show' || effect.kind === 'hide' ? effect.over : undefined;
  if (over !== undefined) return over * 1000;
  return to === 1 ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS;
}
