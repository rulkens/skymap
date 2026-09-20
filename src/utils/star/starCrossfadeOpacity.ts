import { fadeBand } from '../math/fadeBand';

/**
 * A source's recede-direction crossfade opacity at the camera's heliocentric
 * parsec distance: full (1) inside `crossfadePc.inner`, gone (0) past
 * `crossfadePc.outer`. `fadeBand` reads the direction from the edge ordering —
 * `inner < outer` is a recede fade (full at the low edge). Takes the band
 * object directly (not a full source-registry row) so this stays a pure
 * function of two numbers.
 */
export function starCrossfadeOpacity(
  crossfadePc: { readonly inner: number; readonly outer: number },
  camDistPc: number,
): number {
  return fadeBand({ fullAt: crossfadePc.inner, goneAt: crossfadePc.outer }, camDistPc);
}
