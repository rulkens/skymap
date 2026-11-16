import { describe, expect, it } from 'vitest';
import { compassTicks } from '../../../src/utils/sky/compassTicks';

describe('compassTicks', () => {
  it('labels across north: letters every 45°, bearings every 15°, wrapped to 0–359', () => {
    const ticks = compassTicks(0, 120);
    const labelled = ticks.filter((t) => t.label !== null).map((t) => t.label);
    expect(labelled).toEqual(['300', 'NW', '330', '345', 'N', '15', '30', 'NE', '60']);
    expect(ticks.find((t) => t.label === 'N')).toMatchObject({ offset: 0.5, kind: 'cardinal' });
    expect(ticks[0]!.offset).toBe(0);
    expect(ticks.at(-1)!.offset).toBe(1);
  });

  it('places ticks between 5° steps when the heading is off the grid', () => {
    const ticks = compassTicks(182.5, 120);
    expect(ticks[0]!.key).toBe(125);
    expect(ticks.find((t) => t.label === 'S')!.offset).toBeCloseTo(0.5 - 2.5 / 120, 9);
  });
});
