// @vitest-environment jsdom
//
// PoiDetailCard — rendering tests for the rich focused-POI panel.
//
// Mirrors the sibling InfoCard component tests: jsdom env +
// @testing-library/react + createElement so the file stays .ts and is
// picked up by Vitest's `include: ['tests/**/*.test.ts']` glob.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { PoiDetailCard } from '../../../src/components/InfoCard/PoiDetailCard';
import type { StructureRecord } from '../../../src/@types/engine/data/StructureRecord';

// Coma carries an Abell number ('A1656'); the card should expand it.
const comaWithAbell: StructureRecord = {
  id: 'coma',
  name: 'Coma Cluster',
  category: 'cluster',
  worldPos: [0, 100, 0],
  featured: true,
  physicalRadiusMpc: 6,
  abell: 'A1656',
};

// Virgo has no Abell designation — the row must be absent.
const virgoNoAbell: StructureRecord = {
  id: 'virgo-m87',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  featured: true,
  physicalRadiusMpc: 2.2,
};

describe('PoiDetailCard', () => {
  it('shows the expanded Abell designation for a cluster carrying one', () => {
    render(createElement(PoiDetailCard, { poi: comaWithAbell }));
    expect(screen.getByText('Abell')).toBeInTheDocument();
    expect(screen.getByText('Abell 1656')).toBeInTheDocument();
  });

  it('omits the Abell row for a cluster without an Abell designation', () => {
    const { container } = render(createElement(PoiDetailCard, { poi: virgoNoAbell }));
    expect(container.textContent).not.toMatch(/Abell/);
  });

  it('shows the Galaxies row when a member count is supplied', () => {
    render(createElement(PoiDetailCard, { poi: virgoNoAbell, memberCount: 42 }));
    expect(screen.getByText('Galaxies')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('omits the Galaxies row when no member count is supplied', () => {
    const { container } = render(createElement(PoiDetailCard, { poi: virgoNoAbell }));
    expect(container.textContent).not.toMatch(/Galaxies/);
  });

  it('omits the Galaxies row when the count is null (not yet computable)', () => {
    const { container } = render(
      createElement(PoiDetailCard, { poi: virgoNoAbell, memberCount: null }),
    );
    expect(container.textContent).not.toMatch(/Galaxies/);
  });

  it('renders a zero count truthfully (empty sphere over loaded data)', () => {
    render(createElement(PoiDetailCard, { poi: virgoNoAbell, memberCount: 0 }));
    expect(screen.getByText('Galaxies')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
