import type { PointInfo } from './PointInfo';

/**
 * Inputs to the pure desired-hash decision.  The caller passes in the
 * raw `location.hash` string (with or without the leading `#`) because
 * it's cheaper than re-reading `window` from inside the helper, and it
 * keeps the helper testable in the node env.
 */
export type DesiredHashInput = {
  /**
   * The galaxy whose id should appear in the URL.  Named `selected` for
   * historical reasons (predates the selected/focused split) — callers
   * should pass whichever state they're encoding.  The hook below
   * passes `focused`; tests pass synthetic PointInfo fixtures.
   */
  selected: PointInfo | null;
  /** Raw hash, e.g. `"#focus=m31"` or `""`.  Leading `#` optional. */
  currentHash: string;
};
