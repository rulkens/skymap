import { describe, expect, it } from 'vitest';
import { checkBoxSvg } from '../../../src/utils/antiqueChrome/checkBoxSvg';

const INK = '#2b2118';
const WASH = '#6b9e80';

describe('checkBoxSvg', () => {
  it('draws the saltire and the wash only when checked, so the state is a shape as well as a colour', () => {
    const on = checkBoxSvg(true, INK, WASH, '#f7efda');
    const off = checkBoxSvg(false, INK, WASH, '#f7efda');
    expect(on).toContain(`fill="${WASH}"`);
    expect(on).toMatch(/<path d="M3\.4 3\.4Q[^"]+" fill="#2b2118"\/>/);
    expect(off).not.toContain(WASH);
    expect(off).not.toContain('<path');
  });
});
