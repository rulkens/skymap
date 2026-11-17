import { describe, expect, it } from 'vitest';

import { PRESS_CREDIT, PRESS_PICTURES } from '../../../packages/website/src/data/pressPictures';
import { PRESS_KIT } from '../../../tools/site/pressKitPlan';
import { pressCredits } from '../../../tools/site/utils/pressCredits';
import { pressPicturePath } from '../../../tools/site/utils/pressPicturePath';

// The kit is built by hand and never in CI: a renamed shot or a doubled file name would only show on the next run.
describe('the press kit credits', () => {
  const credits = pressCredits(PRESS_PICTURES, PRESS_KIT);

  it('names every picture by its own file, with a credit opening on ours', () => {
    const paths = PRESS_PICTURES.map(pressPicturePath);
    expect(new Set(paths).size).toBe(paths.length);
    for (const row of PRESS_PICTURES) {
      expect(row.credit.startsWith(PRESS_CREDIT)).toBe(true);
      expect(credits).toContain(`${pressPicturePath(row)}\n  ${row.title}`);
      expect(credits).toContain(`Credit to print: ${row.credit}.`);
    }
  });

  it('credits the film and the portrait', () => {
    expect(credits).toContain(PRESS_KIT.filmCredit);
    expect(credits).toContain(PRESS_KIT.portraitCredit);
  });
});
