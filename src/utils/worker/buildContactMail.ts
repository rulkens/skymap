import type { ContactFields } from '../../@types/worker/ContactFields';
import type { ContactMail } from '../../@types/worker/ContactMail';

// The visitor's address goes in Reply-To only, never From: the sender must be our own verified domain.
export function buildContactMail(fields: ContactFields, to: string, from: string): ContactMail {
  return {
    to,
    from: { email: from, name: 'skymap website' },
    replyTo: fields.email,
    subject: `Website enquiry from ${fields.name}`,
    text: `Name: ${fields.name}\nOrganisation: ${fields.organisation}\nEmail: ${fields.email}\n\n${fields.message}\n`,
  };
}
