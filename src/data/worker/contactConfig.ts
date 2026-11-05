/**
 * The contact endpoint's fixed numbers. The path is root-absolute and outside
 * the site and the app (`/home/…` now, the root later; the app's own routes
 * are `/info/…`-style), so it keeps working when the site moves.
 */
export const CONTACT_PATH = '/api/contact';

export const CONTACT_LIMITS = {
  /** Whole request body. Four short fields and a token fit in well under a tenth of this. */
  bodyBytes: 16_384,
  name: 100,
  organisation: 150,
  email: 254,
  message: 5_000,
  /** Turnstile's documented maximum token length. */
  token: 2_048,
} as const;

export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
