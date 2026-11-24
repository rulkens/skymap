/**
 * ClipId — the stable string id of a clip, derived from the keys of `APP_CLIP_FACTORIES`.
 *
 * Adding a clip is one row in that table; the id follows and `startClip(id)` accepts it.
 *
 * An id may be referenced from a shared link or a recorder command, so renaming one silently
 * breaks those. Add new rows; retire old ones deliberately.
 */

import type { APP_CLIP_FACTORIES } from '../../compositions/appClips';

export type ClipId = keyof typeof APP_CLIP_FACTORIES;
