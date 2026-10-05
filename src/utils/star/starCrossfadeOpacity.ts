import { fadeBand } from '../math/fadeBand';

/**
 * Full (1) inside `crossfadePc.inner`, gone (0) past `crossfadePc.outer`. This
 * IS the survey's far gate — there is deliberately no separate max-distance
 * cut, because the star bubble extends well past the <=25 pc scene stars.
 */
export function starCrossfadeOpacity(
  crossfadePc: { readonly inner: number; readonly outer: number },
  camDistPc: number,
): number {
  return fadeBand({ fullAt: crossfadePc.inner, goneAt: crossfadePc.outer }, camDistPc);
}
