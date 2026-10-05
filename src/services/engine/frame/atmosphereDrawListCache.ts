/** atmosphereDrawListCache — `atmosphereDrawList`'s per-frame memo. Weak, so
 * a retired context takes its list with it. */

import type { AtmosphereDrawEntry } from '../../../@types/engine/frame/AtmosphereDrawEntry';
import type { FrameView } from '../../../@types/engine/frame/FrameView';

export const atmosphereDrawListCache = new WeakMap<FrameView, readonly AtmosphereDrawEntry[]>();
