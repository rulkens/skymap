/**
 * Typed so `defaultRetryPolicy` can give up instead of retrying a version
 * mismatch. Lives in `src/data/` — `src/data` must not import `src/services`.
 */
export class FormatVersionError extends Error {
  readonly format: string;
  readonly found: number;
  readonly expected: number;

  constructor(format: string, found: number, expected: number, message: string) {
    super(message);
    // Set in the body: a class-field initializer would run after super()
    // and shadow Error's own `name` under useDefineForClassFields.
    this.name = 'FormatVersionError';
    this.format = format;
    this.found = found;
    this.expected = expected;
  }
}
