// @vitest-environment jsdom
//
// CompactPoiCard — rendering tests for the POI hover preview card.
//
// Mirrors the convention established by the other component tests in
// this folder (jsdom env + @testing-library/react + createElement so
// the file stays .ts and Vitest's `include: ['tests/**/*.test.ts']`
// glob picks it up without a config change).

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { CompactPoiCard } from '../../../src/components/InfoCard/CompactPoiCard';
import type { PointOfInterest } from '../../../src/@types/engine/subsystems/PointOfInterest';

// Fixture POI ~10 Mpc from origin so the distance formatter renders a
// readable Mpc value (formatDistance("Mpc / Mly") shape).  physicalRadiusMpc
// is 2.2 — a real-world Virgo-ish radius.
const virgo: PointOfInterest = {
  id: 'virgo-m87',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  physicalRadiusMpc: 2.2,
};

describe('CompactPoiCard', () => {
  it('renders the POI name and category label', () => {
    render(createElement(CompactPoiCard, { poi: virgo }));
    expect(screen.getByText('Virgo Cluster')).toBeInTheDocument();
    // Category badge — exact-match "Cluster" with title-case from the
    // inlined poiCategoryLabel helper.  Exact match (not /cluster/i)
    // so the headline "Virgo Cluster" doesn't also satisfy this
    // assertion — the badge is the load-bearing surface here.
    expect(screen.getByText('Cluster')).toBeInTheDocument();
  });

  it('renders a distance row derived from |worldPos|', () => {
    render(createElement(CompactPoiCard, { poi: virgo }));
    // |[10, 0, 0]| = 10 Mpc.  formatDistance renders "10.0 Mpc / 32.6 Mly"
    // (formatScalar uses one decimal between 10 and 100); assert on the
    // "Mpc" unit token so the test survives a future tweak to the
    // formatter's decimal places.
    expect(screen.getByText(/Mpc/)).toBeInTheDocument();
  });

  it('renders the physical radius when present', () => {
    render(createElement(CompactPoiCard, { poi: virgo }));
    // formatDistance(2.2) → "2.20 Mpc / 7.18 Mly".  Match on the leading
    // "2.2" digits regardless of surrounding decimals so a future
    // formatScalar adjustment doesn't break the assertion.
    expect(screen.getByText(/2\.2/)).toBeInTheDocument();
  });

  it('omits the radius row when physicalRadiusMpc is undefined', () => {
    const noRadius: PointOfInterest = { ...virgo, physicalRadiusMpc: undefined };
    const { container } = render(createElement(CompactPoiCard, { poi: noRadius }));
    // Smoke check: no '2.2' anywhere in the rendered DOM.  Catches the
    // regression where a future refactor unconditionally renders the
    // radius row with `?? 0`.
    expect(container.textContent).not.toMatch(/2\.2/);
  });
});
