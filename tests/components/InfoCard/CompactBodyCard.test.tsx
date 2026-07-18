// @vitest-environment jsdom
//
// CompactBodyCard — the body hover-preview.  It resolves the constellation
// synchronously from the compile-time FAMOUS_STAR_SEARCH index (no meta fetch),
// so the branch worth pinning is: an indexed star shows its constellation, an
// unindexed body renders name-only rather than crashing.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import CompactBodyCard from '../../../src/components/InfoCard/CompactBodyCard/CompactBodyCard';
import type { BodyInfo } from '../../../src/@types/engine/BodyInfo';

// Proxima Centauri is in the generated seed table → FAMOUS_STAR_SEARCH.
const proxima: BodyInfo = {
  type: 'body',
  id: 'proxima-centauri',
  label: 'Proxima Centauri',
  positionMpc: [0, 0, 0],
  radiusKm: 1.07e5,
};

describe('CompactBodyCard', () => {
  it('shows the headline + constellation from the synchronous index', () => {
    render(createElement(CompactBodyCard, { target: proxima }));
    expect(screen.getByText('Proxima Centauri')).toBeInTheDocument();
    expect(screen.getByText('Centaurus')).toBeInTheDocument();
  });

  it('renders name-only for a body absent from the index (no crash)', () => {
    const unindexed: BodyInfo = { ...proxima, id: 'not-a-star', label: 'Nowhere' };
    const { container } = render(createElement(CompactBodyCard, { target: unindexed }));
    expect(screen.getByText('Nowhere')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Centaurus/);
  });
});
