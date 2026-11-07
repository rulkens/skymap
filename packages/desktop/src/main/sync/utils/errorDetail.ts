/** An error in one line; fetch's "fetch failed" gains its cause, the part that says what broke. */
export function errorDetail(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? `${error.message} (${error.cause.message})` : error.message;
}
