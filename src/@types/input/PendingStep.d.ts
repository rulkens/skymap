import type { Motion } from './Motion';
import type { SourceId } from './SourceId';

/** One step the `input` slice has folded and the frame has not yet drained. */
export type PendingStep =
  | { readonly kind: 'start'; readonly source: SourceId }
  | { readonly kind: 'end'; readonly source: SourceId }
  | ({ readonly kind: 'motion'; readonly source: SourceId; readonly aspect: number } & Motion);
