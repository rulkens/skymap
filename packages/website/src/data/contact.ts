import { REPO_URL } from './siteIdentity';

/**
 * Where the contact form posts. The one configuration value for contact: set
 * `SKYMAP_CONTACT_ENDPOINT` to the Worker's URL at build time once email
 * sending is provisioned. While it is unset the domes page prints a plain
 * "contact opens soon" message in place of the form, so no visitor can fill
 * in a form that goes nowhere.
 */
export const CONTACT_ENDPOINT: string | undefined = process.env.SKYMAP_CONTACT_ENDPOINT || undefined;

/** Public and searchable: the page says so beside the link. */
export const ISSUES_URL = `${REPO_URL}/issues`;
