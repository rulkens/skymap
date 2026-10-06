import { describe, expect, it } from 'vitest';
import { CONTACT_LIMITS } from '../../../src/data/worker/contactConfig';
import { validateContactFields } from '../../../src/utils/worker/validateContactFields';

const good = {
  name: ' Ada Lovelace ',
  organisation: 'Wisdome',
  email: 'ada@example.org',
  message: 'A dome of 12 m.',
  website: '',
  token: 'tok',
};

describe('validateContactFields', () => {
  it('trims and accepts a complete body', () => {
    expect(validateContactFields(good)).toEqual({
      kind: 'ok',
      fields: {
        name: 'Ada Lovelace',
        organisation: 'Wisdome',
        email: 'ada@example.org',
        message: 'A dome of 12 m.',
      },
      token: 'tok',
    });
  });

  it('accepts a body with no website key at all', () => {
    const { website: _unused, ...rest } = good;
    expect(validateContactFields(rest).kind).toBe('ok');
  });

  it.each(['name', 'organisation', 'email', 'message', 'token'])(
    'names %s when it is missing or blank',
    (field) => {
      expect(validateContactFields({ ...good, [field]: undefined })).toEqual({
        kind: 'invalid',
        field,
      });
      expect(validateContactFields({ ...good, [field]: '   ' })).toEqual({
        kind: 'invalid',
        field,
      });
      expect(validateContactFields({ ...good, [field]: 5 })).toEqual({ kind: 'invalid', field });
    },
  );

  it.each([
    ['name', CONTACT_LIMITS.name],
    ['organisation', CONTACT_LIMITS.organisation],
    ['message', CONTACT_LIMITS.message],
    ['token', CONTACT_LIMITS.token],
  ] as const)('caps %s at its limit', (field, max) => {
    expect(validateContactFields({ ...good, [field]: 'a'.repeat(max) }).kind).toBe('ok');
    expect(validateContactFields({ ...good, [field]: 'a'.repeat(max + 1) })).toEqual({
      kind: 'invalid',
      field,
    });
  });

  it.each([
    'ada',
    'ada@example',
    '@example.org',
    'a b@example.org',
    'a@b@example.org',
    '<a@example.org>',
    'a@example.org, b@example.org',
  ])('rejects the email %j', (email) => {
    expect(validateContactFields({ ...good, email })).toEqual({ kind: 'invalid', field: 'email' });
  });

  it.each(['name', 'organisation', 'email'])(
    'rejects a line break in %s, the way a header gets injected',
    (field) => {
      const value =
        field === 'email' ? 'a@example.org\r\nBcc: x@example.org' : 'Ada\r\nBcc: x@example.org';
      expect(validateContactFields({ ...good, [field]: value })).toEqual({
        kind: 'invalid',
        field,
      });
    },
  );

  it('keeps line breaks in the message, normalised, and drops other control characters', () => {
    const check = validateContactFields({ ...good, message: 'one\r\ntwo\u0000\u0007' });
    expect(check.kind === 'ok' && check.fields.message).toBe('one\ntwo');
  });

  it('answers a filled honeypot before it looks at anything else', () => {
    expect(validateContactFields({ website: 'http://spam.example' })).toEqual({ kind: 'honeypot' });
  });

  it.each([null, 'text', 7, [good]])('rejects a body that is not an object: %j', (body) => {
    expect(validateContactFields(body)).toEqual({ kind: 'invalid', field: 'body' });
  });
});
