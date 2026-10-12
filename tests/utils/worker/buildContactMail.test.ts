import { describe, expect, it } from 'vitest';
import { buildContactMail } from '../../../src/utils/worker/buildContactMail';

const fields = {
  name: 'Ada',
  organisation: 'Wisdome',
  email: 'ada@example.org',
  message: 'Line one\nLine two',
};

describe('buildContactMail', () => {
  const mail = buildContactMail(fields, 'inbox@dest.test', 'site@sender.test');

  it('replies to the visitor but is never sent from them', () => {
    expect(mail.replyTo).toBe('ada@example.org');
    expect(mail.from.email).toBe('site@sender.test');
    expect(mail.to).toBe('inbox@dest.test');
  });

  it('is plain text: no html member, and the template adds no tags', () => {
    expect(Object.keys(mail)).not.toContain('html');
    expect(mail.text).toBe(
      'Name: Ada\nOrganisation: Wisdome\nEmail: ada@example.org\n\nLine one\nLine two\n',
    );
  });

  it('puts the name, as validated, in a one-line subject', () => {
    expect(mail.subject).toBe('Website enquiry from Ada');
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });
});
