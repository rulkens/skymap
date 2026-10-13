import type { ContactFields } from './ContactFields';

/**
 * ContactCheck — what `validateContactFields` made of a request body.
 * `honeypot` is its own kind, not an `invalid`: the handler answers it with a
 * success so a bot cannot tell it was caught.
 */
export type ContactCheck =
  | { kind: 'ok'; fields: ContactFields; token: string }
  | { kind: 'honeypot' }
  | { kind: 'invalid'; field: string };
