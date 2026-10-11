import type { ContactCheck } from '../../@types/worker/ContactCheck';
import { CONTACT_LIMITS } from '../../data/worker/contactConfig';

// Line breaks and other control characters in a one-line field are how a header gets injected into the mail, and a
// direction override reorders what the owner reads in the subject; reject, never repair.
const CONTROL = /[\u{0}-\u{1f}\u{7f}\u{85}\u{2028}-\u{202e}\u{2066}-\u{2069}]/u;
// Deliberately loose: one @, a dot in the domain, nothing that could end an address or start a second one. The provider is the real check.
const EMAIL = /^[^\s@<>()[\]\\,;:"']+@[^\s@<>()[\]\\,;:"']+\.[^\s@<>()[\]\\,;:"']+$/;
const MESSAGE_CONTROL = /[\u{0}-\u{8}\u{b}\u{c}\u{e}-\u{1f}\u{7f}]/gu;

export function validateContactFields(input: unknown): ContactCheck {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    return { kind: 'invalid', field: 'body' };
  const body = input as Record<string, unknown>;

  // The honeypot comes first: a bot that filled it gets the same answer whatever else it sent.
  if (body.website !== undefined && body.website !== '') return { kind: 'honeypot' };

  const text = (key: string, max: number): string | undefined => {
    const value = body[key];
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed !== '' && trimmed.length <= max ? trimmed : undefined;
  };

  const name = text('name', CONTACT_LIMITS.name);
  if (name === undefined || CONTROL.test(name)) return { kind: 'invalid', field: 'name' };
  const organisation = text('organisation', CONTACT_LIMITS.organisation);
  if (organisation === undefined || CONTROL.test(organisation))
    return { kind: 'invalid', field: 'organisation' };
  const email = text('email', CONTACT_LIMITS.email);
  if (email === undefined || CONTROL.test(email) || !EMAIL.test(email))
    return { kind: 'invalid', field: 'email' };
  const raw = text('message', CONTACT_LIMITS.message);
  if (raw === undefined) return { kind: 'invalid', field: 'message' };
  const message = raw.replace(/\r\n?/g, '\n').replace(MESSAGE_CONTROL, '');
  if (message === '') return { kind: 'invalid', field: 'message' };
  const token = text('token', CONTACT_LIMITS.token);
  if (token === undefined) return { kind: 'invalid', field: 'token' };

  return { kind: 'ok', fields: { name, organisation, email, message }, token };
}
