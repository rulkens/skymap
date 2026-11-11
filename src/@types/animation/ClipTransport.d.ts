/**
 * Where a clip under transport stands: someone outside the player decides its clock. The player
 * anchors a `running` value at the first frame that sees that OBJECT, so a new value re-anchors
 * even when its numbers repeat (Home pressed twice while playing).
 */
import type { ClipSpan } from './ClipSpan';

export type ClipTransport =
  | { readonly kind: 'paused'; readonly atSec: number; readonly camera: 'clip' | 'free' }
  | { readonly kind: 'running'; readonly fromSec: number; readonly loop: ClipSpan | null };
