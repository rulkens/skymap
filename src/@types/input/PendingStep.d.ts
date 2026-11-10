import type { Motion } from './Motion';
import type { InputSourceId } from './InputSourceId';

/** One step the `input` slice has folded and the frame has not yet drained. */
export type PendingStep =
  | { readonly kind: 'start'; readonly source: InputSourceId }
  | { readonly kind: 'end'; readonly source: InputSourceId }
  | ({ readonly kind: 'motion'; readonly source: InputSourceId; readonly aspect: number } & Motion);
