import type { Motion } from './Motion';
import type { InputSourceId } from './InputSourceId';

/** One step the `input` slice has folded and the frame has not yet drained. `fresh` is a zoom
 * notch that came after `FRESH_WHEEL_PAUSE_MS` of ITS SOURCE's wheel quiet (false for any other
 * intent): judged once, on the first event of a folded run. `liftOff` is Leave while standing
 * with no takeover: the sky arm answers it as a wheel-out past its widest lens, so the lift is
 * still built only in the engine. */
export type PendingStep =
  | { readonly kind: 'liftOff' }
  | { readonly kind: 'start'; readonly source: InputSourceId }
  | { readonly kind: 'end'; readonly source: InputSourceId }
  | ({
      readonly kind: 'motion';
      readonly source: InputSourceId;
      readonly aspect: number;
      readonly fresh: boolean;
    } & Motion);
