// @vitest-environment jsdom
//
// StructureDetailCard — rendering tests for the rich focused-structure panel.
//
// Mirrors the sibling InfoCard component tests: jsdom env +
// @testing-library/react + createElement so the file stays .ts and is
// picked up by Vitest's `include: ['tests/**/*.test.ts']` glob.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { StructureDetailCard } from '../../../src/components/InfoCard/StructureDetailCard';
import type { StructureInfo } from '../../../src/@types/data/structure/StructureInfo';

// Coma carries an Abell number ('A1656'); the card should expand it.
const comaWithAbell: StructureInfo = {
  type: 'structure',
  id: 'coma',
  name: 'Coma Cluster',
  category: 'cluster',
  worldPos: [0, 100, 0],
  featured: true,
  physicalRadiusMpc: 6,
  abell: 'A1656',
};

// Virgo has no Abell designation — the row must be absent.
const virgoNoAbell: StructureInfo = {
  type: 'structure',
  id: 'virgo-m87',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  featured: true,
  physicalRadiusMpc: 2.2,
};

describe('StructureDetailCard', () => {
  it('shows the expanded Abell designation for a cluster carrying one', () => {
    render(createElement(StructureDetailCard, { structure: comaWithAbell }));
    expect(screen.getByText('Abell')).toBeInTheDocument();
    expect(screen.getByText('Abell 1656')).toBeInTheDocument();
  });

  it('omits the Abell row for a cluster without an Abell designation', () => {
    const { container } = render(createElement(StructureDetailCard, { structure: virgoNoAbell }));
    expect(container.textContent).not.toMatch(/Abell/);
  });

  it('shows the Galaxies row when a member count is supplied', () => {
    render(createElement(StructureDetailCard, { structure: virgoNoAbell, memberCount: 42 }));
    expect(screen.getByText('Galaxies')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('omits the Galaxies row when no member count is supplied', () => {
    const { container } = render(createElement(StructureDetailCard, { structure: virgoNoAbell }));
    expect(container.textContent).not.toMatch(/Galaxies/);
  });

  it('omits the Galaxies row when the count is null (not yet computable)', () => {
    const { container } = render(
      createElement(StructureDetailCard, { structure: virgoNoAbell, memberCount: null }),
    );
    expect(container.textContent).not.toMatch(/Galaxies/);
  });

  it('renders a zero count truthfully (empty sphere over loaded data)', () => {
    render(createElement(StructureDetailCard, { structure: virgoNoAbell, memberCount: 0 }));
    expect(screen.getByText('Galaxies')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
