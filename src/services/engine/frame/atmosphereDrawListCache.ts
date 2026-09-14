/** atmosphereDrawListCache — `atmosphereDrawList`'s per-frame memo. Weak, so
 * a retired context takes its list with it. */

import type { AtmosphereDrawEntry } from '../../../@types/engine/frame/AtmosphereDrawEntry';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';

export const atmosphereDrawListCache = new WeakMap<
  ReadyFrameContext,
  readonly AtmosphereDrawEntry[]
>();
