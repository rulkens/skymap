/** Canals are post-1690 and dropped, by class, name or (when nameless) id, but a named ancient branch stays. */

import { describe, it, expect } from 'vitest';

import { isPre1690River } from '../../../../../tools/antique/earth/utils/isPre1690River';

describe('isPre1690River', () => {
  it('drops canals and intermittent rivers, keeps rivers, lake centrelines and the Gharraf', () => {
    const kept = [
      { featurecla: 'River', name: 'Rhine' },
      { featurecla: 'Lake Centerline', name: 'Volga' },
      { featurecla: 'River', name: null },
      { featurecla: 'River', name: 'Gharraf Canal' },
      { featurecla: 'River', name: 'Canale' },
    ];
    const dropped = [
      { featurecla: 'Canal', name: 'Erie' },
      { featurecla: 'Intermittent River', name: 'Wadi' },
      { featurecla: 'River', name: 'Suez Canal' },
      { featurecla: 'River', name: 'Dortmund-Ems Kanal' },
      { featurecla: 'River', name: 'Noordhollandsch Kanaal' },
      { featurecla: 'River', name: 'North Channel' },
      { featurecla: 'River', name: null, ne_id: 1159127783 },
    ];
    expect(kept.map(isPre1690River)).toEqual(kept.map(() => true));
    expect(dropped.map(isPre1690River)).toEqual(dropped.map(() => false));
  });
});
