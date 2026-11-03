import { REPO_URL } from './siteIdentity';

// Build-time values; the form exists only when both are set, so no visitor fills in one the server would refuse.
// Every page that words itself by "is the form open" reads CONTACT_ENDPOINT.
export const TURNSTILE_SITE_KEY: string | undefined = process.env.SKYMAP_TURNSTILE_SITE_KEY || undefined;
export const CONTACT_ENDPOINT: string | undefined =
  TURNSTILE_SITE_KEY && process.env.SKYMAP_CONTACT_ENDPOINT ? process.env.SKYMAP_CONTACT_ENDPOINT : undefined;

/** Where a commission enquiry goes while the form is closed (owner, 2026-10-30). */
export const CONTACT_EMAIL = 'alex@rulkens.com';

/** Public and searchable: the page says so beside the link. */
export const ISSUES_URL = `${REPO_URL}/issues`;
