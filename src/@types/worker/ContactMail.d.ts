/**
 * ContactMail — the message handed to the `send_email` binding's structured
 * `send()`. Plain text only: there is deliberately no `html` member, so a
 * visitor's text can never be interpreted as markup by the mail client.
 */
export type ContactMail = {
  to: string;
  from: { email: string; name: string };
  replyTo: string;
  subject: string;
  text: string;
};
