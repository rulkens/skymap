/**
 * The compiler's verdict on the resolved draft: its spans and duration, or the error with the
 * spans walked before it, so an invalid draft still draws at true times (A7).
 */
import type { EffectSpan } from '../../../../../src/@types/animation/EffectSpan';
import type { ClipCompileErrorInfo } from './ClipCompileErrorInfo';

export type TimelineCompile =
  | { readonly ok: true; readonly spans: readonly EffectSpan[]; readonly durationSec: number }
  | {
      readonly ok: false;
      readonly spans: readonly EffectSpan[];
      readonly error: ClipCompileErrorInfo;
    };
