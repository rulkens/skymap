import type { FocusUniformsValue } from '../../rendering/FocusUniformsValue';
import type { SelectionRefBase } from '../selection/SelectionRefBase';

/** One tick of the focus ramp: what a frame publishes as `focus`, `focusBlend`, `focusPickId`. */
export type FocusFrame = {
  /** The spatial sphere; at its zero-blend rest value when the subject has no sphere. */
  readonly uniforms: FocusUniformsValue;
  /** The recession blend 0→1, for every subject. */
  readonly blend: number;
  /** The subject the blend is about, latched through the fade-out; null once it settles at 0. */
  readonly ref: SelectionRefBase | null;
};
