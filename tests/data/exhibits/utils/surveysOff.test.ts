import { describe, expect, it } from 'vitest';

import { SURVEYS_OFF } from '../../../../src/data/exhibits/utils/surveysOff';

describe('SURVEYS_OFF', () => {
  it('keeps the famous galaxies as landmarks and silences every survey', () => {
    const enabled = Object.entries(SURVEYS_OFF.items)
      .filter(([, item]) => item.enabled)
      .map(([id]) => id);
    expect(enabled).toEqual(['famousGalaxy']);
  });
});
