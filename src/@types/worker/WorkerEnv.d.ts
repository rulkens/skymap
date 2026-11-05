import type { ContactMailer } from './ContactMailer';

/**
 * WorkerEnv — everything the Worker receives from Cloudflare. The four contact
 * members are optional on purpose: while any is unset (docs/DEPLOY.md, "Opening
 * the contact form") the contact endpoint is closed and answers 503.
 */
export type WorkerEnv = {
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** The `send_email` binding. */
  CONTACT_EMAIL?: ContactMailer;
  /** Where the enquiries go: a destination verified in Email Routing. A secret, never in the repo. */
  CONTACT_TO?: string;
  /** The sender address, on a domain onboarded to Cloudflare email sending. */
  CONTACT_FROM?: string;
  /** The Turnstile widget's secret key. */
  TURNSTILE_SECRET_KEY?: string;
};
