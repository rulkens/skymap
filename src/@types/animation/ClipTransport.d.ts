/** Where a clip under transport stands, decided outside the player. A `running` value anchors at
 * the first frame that sees that OBJECT, so a new one re-anchors even when its numbers repeat. */
import type { ClipSpan } from './ClipSpan';

export type ClipTransport =
  | { readonly kind: 'paused'; readonly atSec: number; readonly camera: 'clip' | 'free' }
  | { readonly kind: 'running'; readonly fromSec: number; readonly loop: ClipSpan | null };
