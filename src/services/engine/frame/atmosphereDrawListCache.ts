/**
 * atmosphereDrawListCache — `atmosphereDrawList`'s per-frame memo. It lives in
 * its own file because a module-scope const beside the derivation would be a
 * second declaration in a frame file (`frameFilePurity.test.ts`). Weak so a
 * retired frame context takes its list with it; keyed on the context alone,
 * since that is the object a frame is, while `state` is a live getter the
 * derivation reads through.
 */

import type { AtmosphereDrawEntry } from '../../../@types/engine/frame/AtmosphereDrawEntry';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';

export const atmosphereDrawListCache = new WeakMap<
  ReadyFrameContext,
  readonly AtmosphereDrawEntry[]
>();
