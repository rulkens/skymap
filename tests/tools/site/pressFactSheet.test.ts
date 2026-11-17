import { describe, expect, it } from 'vitest';

import { CONTACT_EMAIL } from '../../../packages/website/src/data/contact';
import { MAKER_SITE, REPO_URL } from '../../../packages/website/src/data/siteIdentity';
import { PRESS_KIT } from '../../../tools/site/pressKitPlan';
import { pressDescription } from '../../../tools/site/utils/pressDescription';
import { pressFactSheet } from '../../../tools/site/utils/pressFactSheet';

const words = (text: string) => text.split(/\s+/).length;

// The descriptions are the fact registry's own sentences, so a row rewritten longer silently outgrows its slot.
describe('the press kit fact sheet', () => {
  it('keeps the descriptions to the lengths they are offered as', () => {
    expect(words(pressDescription(PRESS_KIT.short))).toBeLessThanOrEqual(50);
    expect(words(pressDescription(PRESS_KIT.long))).toBeLessThanOrEqual(150);
  });

  it('gives the addresses and the contact a journalist needs', () => {
    const sheet = pressFactSheet(PRESS_KIT);
    for (const needed of [CONTACT_EMAIL, REPO_URL, MAKER_SITE, 'https://skymap.rulkens.com/']) {
      expect(sheet).toContain(needed);
    }
  });

  it('refuses a sentence a fact does not have', () => {
    expect(() => pressDescription([{ fact: 'about-maker', sentences: [5] }])).toThrow(
      /no sentence 5/,
    );
  });
});
