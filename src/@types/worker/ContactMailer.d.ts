import type { ContactMail } from './ContactMail';

/** The part of Cloudflare's `send_email` binding the contact endpoint uses; `send` rejects with an `Error` carrying a `code` when the provider refuses. */
export type ContactMailer = {
  send(mail: ContactMail): Promise<{ messageId: string }>;
};
