import { describe, it, expect } from 'vitest';

import { CHANNEL_FAMILY, CHANNEL_FAMILY_LEGEND } from '../../src/data/channelFamilies';

describe('channelFamilies', () => {
  it('the legend lists every family exactly once', () => {
    const legend = CHANNEL_FAMILY_LEGEND.map((entry) => entry.family).sort();
    expect(legend).toEqual(['distance', 'layers', 'lookAt', 'settings', 'turn']);
  });

  it('every channel maps to a family the legend shows', () => {
    const shown = new Set(CHANNEL_FAMILY_LEGEND.map((entry) => entry.family));
    for (const family of Object.values(CHANNEL_FAMILY)) expect(shown.has(family)).toBe(true);
  });
});
