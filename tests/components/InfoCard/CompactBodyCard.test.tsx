// @vitest-environment jsdom
//
// CompactBodyCard — the body hover-preview.  It resolves the constellation
// synchronously via constellationOfBody (no meta fetch), so the branches worth
// pinning are: an indexed star shows its constellation, while an unindexed body
// and a star in no constellation both render name-only rather than crashing or
// printing the seed table's 'None' sentinel.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import CompactBodyCard from '../../../src/components/InfoCard/CompactBodyCard/CompactBodyCard';
import type { BodyInfo } from '../../../src/@types/engine/BodyInfo';

// Proxima Centauri is in the generated seed table, with a real constellation.
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

  it("drops the chip for the Sun rather than printing the 'None' sentinel", () => {
    // The Sun IS in the seed table, so the miss path never runs — its row spells
    // "in no constellation" as the string 'None', which used to render verbatim.
    const sun: BodyInfo = { ...proxima, id: 'sun', label: 'Sun' };
    const { container } = render(createElement(CompactBodyCard, { target: sun }));
    expect(screen.getByText('Sun')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/None/);
  });
});
