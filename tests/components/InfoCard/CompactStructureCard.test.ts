// @vitest-environment jsdom
//
// CompactStructureCard — rendering tests for the structure hover preview card.
//
// Mirrors the convention established by the other component tests in
// this folder (jsdom env + @testing-library/react + createElement so
// the file stays .ts and Vitest's `include: ['tests/**/*.test.ts']`
// glob picks it up without a config change).

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { CompactStructureCard } from '../../../src/components/InfoCard/CompactStructureCard';
import type { StructureRecord } from '../../../src/@types/data/structure/StructureRecord';

// Fixture structure ~10 Mpc from origin so the distance formatter renders a
// readable Mpc value (formatDistance("Mpc / Mly") shape).  physicalRadiusMpc
// is 2.2 — a real-world Virgo-ish radius.
const virgo: StructureRecord = {
  id: 'virgo-m87',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  featured: true,
  physicalRadiusMpc: 2.2,
};

describe('CompactStructureCard', () => {
  it('renders the structure name and category label', () => {
    render(createElement(CompactStructureCard, { structure: virgo }));
    expect(screen.getByText('Virgo Cluster')).toBeInTheDocument();
    // Category badge — exact-match "Cluster" with title-case from the
    // inlined category-label helper.  Exact match (not /cluster/i)
    // so the headline "Virgo Cluster" doesn't also satisfy this
    // assertion — the badge is the load-bearing surface here.
    expect(screen.getByText('Cluster')).toBeInTheDocument();
  });

  it('renders a distance row derived from |worldPos|', () => {
    render(createElement(CompactStructureCard, { structure: virgo }));
    // |[10, 0, 0]| = 10 Mpc.  formatDistance renders "10.0 Mpc / 32.6 Mly"
    // (formatScalar uses one decimal between 10 and 100); assert on the
    // "Mpc" unit token so the test survives a future tweak to the
    // formatter's decimal places.
    expect(screen.getByText(/Mpc/)).toBeInTheDocument();
  });

  it('renders the physical radius when present', () => {
    render(createElement(CompactStructureCard, { structure: virgo }));
    // formatDistance(2.2) → "2.20 Mpc / 7.18 Mly".  Match on the leading
    // "2.2" digits regardless of surrounding decimals so a future
    // formatScalar adjustment doesn't break the assertion.
    expect(screen.getByText(/2\.2/)).toBeInTheDocument();
  });
});
