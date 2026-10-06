import { REPO_URL } from './siteIdentity';

/**
 * The two configuration values for contact, both read at build time:
 * `SKYMAP_CONTACT_ENDPOINT` (the Worker's path, `/api/contact`) and
 * `SKYMAP_TURNSTILE_SITE_KEY` (the public key of the Turnstile widget). The form
 * exists only when both are set, so while either is missing the domes page prints
 * a plain "contact opens soon" message and no visitor can fill in a form that
 * goes nowhere, or that the server would refuse for lack of a spam check.
 * Every page that words itself by "is the form open" reads CONTACT_ENDPOINT.
 */
export const TURNSTILE_SITE_KEY: string | undefined = process.env.SKYMAP_TURNSTILE_SITE_KEY || undefined;
export const CONTACT_ENDPOINT: string | undefined =
  TURNSTILE_SITE_KEY && process.env.SKYMAP_CONTACT_ENDPOINT ? process.env.SKYMAP_CONTACT_ENDPOINT : undefined;

/** Public and searchable: the page says so beside the link. */
export const ISSUES_URL = `${REPO_URL}/issues`;
