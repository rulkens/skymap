/**
 * Thrown when a binary format module reads an on-disk version it doesn't
 * understand. Typed (rather than a plain `Error`) so `defaultRetryPolicy`
 * can recognize a version mismatch as permanent — see
 * `src/services/loading/retryPolicy.ts`. Lives in `src/data/` (not
 * `src/services/loading/`) because the throw sites are the format modules
 * and `src/data` must not import from `src/services`.
 */
export class FormatVersionError extends Error {
  /** Which binary family — e.g. 'galaxy catalog'. */
  readonly format: string;
  readonly found: number;
  readonly expected: number;

  constructor(format: string, found: number, expected: number, message: string) {
    super(message);
    // Set in the body, not as a class-field initialiser: under
    // useDefineForClassFields a field initialiser runs after `super()` and
    // shadows Error's own `name` property (mirrors HttpError in
    // fetchWithProgress.ts).
    this.name = 'FormatVersionError';
    this.format = format;
    this.found = found;
    this.expected = expected;
  }
}
