import { describe, expect, it } from 'vitest';

import { VOYAGE_DESTINATIONS } from '../../../src/data/voyage/voyageDestinations';
import { shipStateAt } from '../../../src/utils/relativity/shipStateAt';
import { tripOf } from '../../../src/utils/relativity/tripOf';
import { voyageReadouts } from '../../../src/utils/voyage/voyageReadouts';
import { voyageTripLy } from '../../../src/utils/voyage/voyageTripLy';

describe('voyageReadouts', () => {
  it('voyageReadouts at the M31 turnaround', () => {
    const m31 = VOYAGE_DESTINATIONS.m31;
    const tripLy = voyageTripLy(m31);
    const r = voyageReadouts(m31, shipStateAt(tripLy, tripOf(tripLy).tEarthTotalYr / 2));
    expect(r.shipClock).toContain('14 yr');
    expect(r.earthClock).toBe('1,270,000 yr');
    expect(r.gamma).toBe('1.31 × 10⁶');
    expect(r.speed).toMatch(/^1 − β = \d\.\d × 10⁻¹³$/);
    expect(r.aheadEarthLy).toBe('1.27 Mly');
    // Half the 1.94 ly the whole Sun–M31 span measures in the ship's frame: 1/a.
    expect(r.aheadShipLy).toBe('0.969 ly');
  });

  it('reads β plainly below 0.999', () => {
    const proxima = VOYAGE_DESTINATIONS.proxima;
    const r = voyageReadouts(proxima, shipStateAt(voyageTripLy(proxima), 1));
    expect(r.speed).toMatch(/^β = 0\.\d{4}$/);
  });
});
