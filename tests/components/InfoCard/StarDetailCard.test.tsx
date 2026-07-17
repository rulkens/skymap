// @vitest-environment jsdom
//
// StarDetailCard — rendering tests for the rich focused-star panel.
//
// The card resolves its narrative/physical rows from the async
// `useFamousStarsMeta` sidecar by looking up `target.id`.  We mock the hook so
// each test controls exactly what the sidecar returns: a resolved entry, an
// empty (pre-fetch / no-sidecar) state, and an entry missing its optional
// fields.  Asserting on rendered text keeps the contract stable against
// CSS-modules class mangling.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import StarDetailCard from '../../../src/components/InfoCard/StarDetailCard/StarDetailCard';
import type { StarInfo } from '../../../src/@types/engine/StarInfo';
import type { FamousStarMetaEntry } from '../../../src/@types/loading/FamousStarMetaEntry';
import type { UseFamousStarsMetaReturn } from '../../../src/@types/engine/UseFamousStarsMetaReturn';
import { useFamousStarsMeta } from '../../../src/hooks/useFamousStarsMeta';

vi.mock('../../../src/hooks/useFamousStarsMeta', () => ({
  useFamousStarsMeta: vi.fn(),
}));

const mockedHook = vi.mocked(useFamousStarsMeta);

function stubMeta(ret: UseFamousStarsMetaReturn): void {
  mockedHook.mockReturnValue(ret);
}

const rigelTarget: StarInfo = {
  type: 'body',
  id: 'rigel',
  label: 'Rigel',
  positionMpc: [0, 0, 0],
  radiusKm: 5.5e7,
};

const rigelMeta: FamousStarMetaEntry = {
  id: 'rigel',
  names: ['Rigel', 'Beta Orionis', 'β Ori'],
  constellation: 'Orion',
  spectralType: 'B8Ia',
  distancePc: 264.6,
  magV: 0.13,
  absMag: -7.84,
  radiusSolar: 78.9,
  temperatureK: 12100,
  massSolar: 21,
  luminositySolar: 120000,
  ageGyr: 0.008,
  description: 'Rigel is a blue supergiant and the brightest star in Orion.',
};

describe('StarDetailCard', () => {
  beforeEach(() => {
    mockedHook.mockReset();
  });

  it('renders headline + also-known-as + description from resolved meta', () => {
    stubMeta({ famousStarsMeta: [rigelMeta], ready: true });
    render(createElement(StarDetailCard, { target: rigelTarget }));

    expect(screen.getByText('Rigel')).toBeInTheDocument();
    // Aliases come from names.slice(1) — the primary name heads the card.
    expect(screen.getByText(/Beta Orionis/)).toBeInTheDocument();
    expect(screen.getByText(rigelMeta.description)).toBeInTheDocument();
  });

  it('renders headline only before meta resolves', () => {
    stubMeta({ famousStarsMeta: [], ready: false });
    const { container } = render(createElement(StarDetailCard, { target: rigelTarget }));

    // Headline still shows from StarInfo.label — a star is always selectable.
    expect(screen.getByText('Rigel')).toBeInTheDocument();
    // No properties block resolved, no crash.
    expect(container.textContent).not.toMatch(/Spectral/);
    expect(container.textContent).not.toMatch(/Temperature/);
  });

  it('omits absent optional properties', () => {
    const { massSolar, luminositySolar, ageGyr, ...lean } = rigelMeta;
    void massSolar;
    void luminositySolar;
    void ageGyr;
    stubMeta({ famousStarsMeta: [lean], ready: true });
    const { container } = render(createElement(StarDetailCard, { target: rigelTarget }));

    // Required rows still render…
    expect(screen.getByText('Spectral type')).toBeInTheDocument();
    // …but the optional lines are dropped, not shown blank.
    expect(container.textContent).not.toMatch(/Mass/);
    expect(container.textContent).not.toMatch(/Age/);
    expect(container.textContent).not.toMatch(/Luminosity/);
  });
});
