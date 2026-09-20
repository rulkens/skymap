import { fadeBand } from '../math/fadeBand';

/** Full (1) inside `crossfadePc.inner`, gone (0) past `crossfadePc.outer`. */
export function starCrossfadeOpacity(
  crossfadePc: { readonly inner: number; readonly outer: number },
  camDistPc: number,
): number {
  return fadeBand({ fullAt: crossfadePc.inner, goneAt: crossfadePc.outer }, camDistPc);
}
