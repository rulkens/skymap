import { describe, expect, it } from 'vitest';

import { parsePhoneArgs } from '../../../tools/phone/parsePhoneArgs';
import { parseTapTarget } from '../../../tools/phone/parseTapTarget';
import { quadCentre } from '../../../tools/phone/quadCentre';

describe('parseTapTarget', () => {
  it('reads x,y as a point and everything else as a selector', () => {
    expect(parseTapTarget('120,340.5')).toEqual({ kind: 'point', point: { x: 120, y: 340.5 } });
    expect(parseTapTarget('[aria-label="Search"]')).toEqual({
      kind: 'selector',
      selector: '[aria-label="Search"]',
    });
    expect(parseTapTarget('.a,.b').kind).toBe('selector');
  });
});

describe('quadCentre', () => {
  it('is the mean of the four corners', () => {
    expect(quadCentre([10, 20, 30, 20, 30, 60, 10, 60])).toEqual({ x: 20, y: 40 });
  });
});

describe('parsePhoneArgs tap / swipe', () => {
  it('takes the target first and the link after it', () => {
    const a = parsePhoneArgs(['tap', 'button.x', 'focus=body-saturn']);
    expect(a.target).toEqual({ kind: 'selector', selector: 'button.x' });
    expect(a.link).toBeDefined();
    expect(parsePhoneArgs(['tap', '5,6']).link).toBeUndefined();
  });

  it('takes two points and --ms for swipe', () => {
    const a = parsePhoneArgs(['swipe', '1,2', '3,4', '--ms', '500']);
    expect(a.target).toEqual({ kind: 'point', point: { x: 1, y: 2 } });
    expect(a.to).toEqual({ x: 3, y: 4 });
    expect(a.ms).toBe(500);
  });

  it('rejects missing or non-point arguments', () => {
    expect(() => parsePhoneArgs(['tap'])).toThrow(/needs/);
    expect(() => parsePhoneArgs(['swipe', '1,2'])).toThrow(/needs/);
    expect(() => parsePhoneArgs(['swipe', '1,2', '.sheet'])).toThrow(/two x,y points/);
  });
});
