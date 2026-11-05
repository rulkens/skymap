import { describe, expect, it } from 'vitest';

import type { FoldMeasure } from '../../../tools/site/@types/FoldMeasure';
import { foldVerdict } from '../../../tools/site/utils/foldVerdict';

const wide = { width: 1280, height: 665, phone: false };
const phone = { width: 390, height: 760, phone: true };
const fits: FoldMeasure = {
  bottom: 665,
  titleBottom: 200,
  leadBottom: 300,
  pictureTop: 72,
  bodyTop: null,
};

describe('foldVerdict', () => {
  it('passes a section that ends at the window foot, and one a rounding fraction past it', () => {
    expect(foldVerdict(fits, wide)).toBeNull();
    expect(foldVerdict({ ...fits, bottom: 665.4 }, wide)).toBeNull();
  });

  it('fails a wide section whose foot, where the label is, falls off the screen', () => {
    expect(foldVerdict({ ...fits, bottom: 731 }, wide)).toBe(
      'the section ends 66px below the first screen',
    );
  });

  it('lets a phone section run on, as long as the title, the lead and the picture start are in', () => {
    expect(foldVerdict({ ...fits, bottom: 1261, pictureTop: 330 }, phone)).toBeNull();
    expect(foldVerdict({ ...fits, bottom: 1261, titleBottom: 889 }, phone)).toMatch(/^the title/);
    expect(foldVerdict({ ...fits, bottom: 1261, leadBottom: 790 }, phone)).toMatch(/^the lead/);
    expect(foldVerdict({ ...fits, bottom: 1261, pictureTop: 760 }, phone)).toMatch(/^the picture/);
  });

  it('wants a line of a docs page’s first heading, table or figure on the first screen', () => {
    const docs = { ...fits, bottom: 344 };
    expect(foldVerdict({ ...docs, bodyTop: 625 }, wide)).toBeNull();
    expect(foldVerdict({ ...docs, bodyTop: 735 }, wide)).toBe(
      'the first heading, table or figure starts 110px below the first screen',
    );
    expect(foldVerdict({ ...docs, bodyTop: 1400 }, phone)).toBeNull();
  });

  it('fails a page with no opening section marked, and tolerates one without a lead or a picture', () => {
    expect(foldVerdict(null, wide)).toMatch(/data-opening/);
    expect(
      foldVerdict(
        { bottom: 600, titleBottom: 200, leadBottom: null, pictureTop: null, bodyTop: null },
        phone,
      ),
    ).toBeNull();
  });
});
