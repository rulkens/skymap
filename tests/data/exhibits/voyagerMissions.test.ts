import { describe, it, expect } from 'vitest';

import { voyagerMissions } from '../../../src/data/exhibits/voyagerMissions';

describe('voyagerMissions settings', () => {
  it('turns the mission trails on with Voyager 1 emphasised, orbit trails untouched', () => {
    expect(voyagerMissions.settings.missionTrails).toEqual({ enabled: true, emphasis: 'voyager1' });
    expect(voyagerMissions.settings.orbitTrails).toEqual({ enabled: true });
  });
});
