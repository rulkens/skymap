import { TURNSTILE_VERIFY_URL } from '../../data/worker/contactConfig';

/**
 * Asks Cloudflare whether a Turnstile token is genuine. `unavailable` is kept
 * apart from `failed` so a Cloudflare outage is not reported to a real visitor
 * as a spam verdict. The visitor's IP is not sent: it is optional and the
 * privacy page does not promise it.
 */
export async function verifyTurnstile(
  token: string,
  secret: string,
): Promise<'passed' | 'failed' | 'unavailable'> {
  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return 'unavailable';
    const verdict = (await response.json()) as { success?: unknown };
    return verdict.success === true ? 'passed' : 'failed';
  } catch {
    return 'unavailable';
  }
}
