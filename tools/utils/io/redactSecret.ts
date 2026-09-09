/**
 * redactSecret — every URL-derived progress/error message must pass
 * through this first; see `data/raw/dhm/README.md`'s keychain rule.
 */
export function redactSecret(text: string, secret: string): string {
  if (secret.length === 0) return text;
  return text.split(secret).join('<redacted>');
}
