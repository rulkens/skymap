/**
 * Typed so `defaultRetryPolicy` can give up instead of retrying a version
 * mismatch. Lives in `data/`, not beside the policy in `src/services/`: data
 * must not import services, and the shared SCFD decoder throws it too.
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
