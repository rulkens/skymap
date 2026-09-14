/**
 * atmosphereDrawListCache — `atmosphereDrawList`'s per-frame memo, keyed on the
 * context alone: that is the object a frame IS, while `state` is a live getter
 * the derivation reads through. Weak, so a retired context takes its list with it.
 */

import type { AtmosphereDrawEntry } from '../../../@types/engine/frame/AtmosphereDrawEntry';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';

export const atmosphereDrawListCache = new WeakMap<
  ReadyFrameContext,
  readonly AtmosphereDrawEntry[]
>();
