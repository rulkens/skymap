import type { TurnstileApi } from '../@types/TurnstileApi';

/** Cloudflare Turnstile's script, once it has loaded and set its global; undefined before. */
export function turnstileApi(): TurnstileApi | undefined {
  return (window as unknown as { turnstile?: TurnstileApi }).turnstile;
}
