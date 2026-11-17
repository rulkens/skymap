import { describe, it, expect } from 'vitest';

import { arrivalFor } from '../../../../../src/services/engine/camera/framing/arrivalFor';
import { MILKY_WAY_ROW } from '../../../../fixtures/milkyWayRow';
import { installAppSelectionKinds } from '../../../../support/installAppSelectionKinds';
import type { PlacedRow } from '../../../../../src/@types/engine/selection/PlacedRow';

installAppSelectionKinds();

describe('arrivalFor', () => {
  it('frames a placed row on its own position', () => {
    expect(arrivalFor(MILKY_WAY_ROW, 0.8).target).toEqual((MILKY_WAY_ROW as PlacedRow).positionMpc);
  });

  it('throws naming a kind with no focus', () => {
    expect(() => arrivalFor({ type: 'zoneOfAvoidance' }, 0.8)).toThrow(/zoneOfAvoidance/);
  });
});
