/**
 * Clip — a named, user-facing animation clip: the authored `ClipData` plus the
 * identity and label the registry and UI key off.
 *
 * `id` is the durable handle `startClip(id)` resolves against `clipRegistry`;
 * `label` is the human-readable name a launcher button shows. `data` is the
 * serializable clip the player compiles and runs. Carrying `id` on the object
 * (redundant with the registry key) lets a whole `Clip` be passed around and
 * still know its own identity — the same shape as a `Tour`.
 *
 * The `label`/`id` wrapper lives here rather than inside `ClipData` so the
 * authored animation stays a pure timeline — `ClipData` is what the compiler
 * and evaluator consume, with no presentation concerns mixed in.
 */

import type { ClipId } from './ClipId';
import type { ClipData } from './ClipData';

export type Clip = {
  readonly id: ClipId;
  readonly label: string;
  readonly data: ClipData;
};
