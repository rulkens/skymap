/**
 * redactSecret — replace every occurrence of `secret` in `text` with
 * `<redacted>`. Every progress line and thrown message the fetch CLIs build
 * from a URL carrying `apikey=<key>` must pass through this first — see
 * `data/raw/dhm/README.md`'s keychain rule.
 */
export function redactSecret(text: string, secret: string): string {
  if (secret.length === 0) return text;
  return text.split(secret).join('<redacted>');
}
