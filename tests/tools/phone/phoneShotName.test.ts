import { describe, expect, it } from 'vitest';

import { phoneShotName } from '../../../tools/phone/phoneShotName';

const now = new Date(2026, 9, 5, 14, 30, 5);

describe('phoneShotName', () => {
  it("names the shot after the tab URL's subject, with the phone prefix", () => {
    expect(phoneShotName('https://192.168.20.62:4443/?cinema#focus=body-saturn&t=1', now)).toBe(
      'data/shots/phone-body-saturn-20261005-143005.jpg',
    );
  });

  it('falls back to "shot" for a tab with no deep link', () => {
    expect(phoneShotName('about:blank', now)).toBe('data/shots/phone-shot-20261005-143005.jpg');
  });
});
