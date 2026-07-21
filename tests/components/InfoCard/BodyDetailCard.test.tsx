// @vitest-environment jsdom
//
// BodyDetailCard — rendering tests for the rich focused-body panel.
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
import BodyDetailCard from '../../../src/components/InfoCard/BodyDetailCard/BodyDetailCard';
import type { BodyInfo } from '../../../src/@types/engine/BodyInfo';
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

const rigelTarget: BodyInfo = {
  type: 'body',
  id: 'rigel',
  label: 'Rigel',
  positionMpc: [0, 0, 0],
  radiusKm: 5.5e7,
};

// Jupiter is a non-star body: its id misses FAMOUS_STAR_IDS, so the card takes
// the lean branch (name + physical radius, no star-sidecar lookup).
const jupiterTarget: BodyInfo = {
  type: 'body',
  id: 'jupiter',
  label: 'Jupiter',
  positionMpc: [0, 0, 0],
  radiusKm: 69911,
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

describe('BodyDetailCard', () => {
  beforeEach(() => {
    mockedHook.mockReset();
  });

  it('renders headline + also-known-as + description + Wikipedia link from resolved meta', () => {
    stubMeta({ famousStarsMeta: [rigelMeta], ready: true });
    render(createElement(BodyDetailCard, { target: rigelTarget }));

    expect(screen.getByText('Rigel')).toBeInTheDocument();
    // Aliases come from names.slice(1) — the primary name heads the card.
    expect(screen.getByText(/Beta Orionis/)).toBeInTheDocument();
    expect(screen.getByText(rigelMeta.description)).toBeInTheDocument();
    // "Learn more" Wikipedia link — Rigel's primary name is the article slug.
    expect(screen.getByRole('link', { name: 'Wikipedia' })).toHaveAttribute(
      'href',
      'https://en.wikipedia.org/wiki/Rigel',
    );
  });

  it('renders headline only before meta resolves', () => {
    stubMeta({ famousStarsMeta: [], ready: false });
    const { container } = render(createElement(BodyDetailCard, { target: rigelTarget }));

    // Headline still shows from BodyInfo.label — a body is always selectable.
    expect(screen.getByText('Rigel')).toBeInTheDocument();
    // No properties block resolved, no crash.
    expect(container.textContent).not.toMatch(/Spectral/);
    expect(container.textContent).not.toMatch(/Temperature/);
  });

  it("shows a planet's fact sheet + Wikipedia link and omits the stellar rows", () => {
    // The hook still runs (rules-of-hooks forbid a conditional call), but a
    // non-star body must not consume it — even when the sidecar returns a
    // stellar entry, no meta rows leak onto a planet card.  Jupiter's rows come
    // from the compiled-in BODY_FACTS table, not the star sidecar.
    stubMeta({ famousStarsMeta: [rigelMeta], ready: true });
    const { container } = render(createElement(BodyDetailCard, { target: jupiterTarget }));

    expect(screen.getByText('Jupiter')).toBeInTheDocument();
    // Radius stays first (straight off BodyInfo).
    expect(screen.getByText(`${jupiterTarget.radiusKm.toLocaleString()} km`)).toBeInTheDocument();
    // A few fact-sheet rows from BODY_FACTS.jupiter.
    expect(screen.getByText('317.8 M⊕')).toBeInTheDocument();
    expect(screen.getByText('2.53 g')).toBeInTheDocument();
    expect(screen.getByText('9.9 hours')).toBeInTheDocument();
    expect(screen.getByText('95')).toBeInTheDocument();
    // "Learn more" Wikipedia link uses the body's explicit wikiTitle.
    expect(screen.getByRole('link', { name: 'Wikipedia' })).toHaveAttribute(
      'href',
      'https://en.wikipedia.org/wiki/Jupiter',
    );
    // No stellar / meta rows leak onto a planet card.
    expect(container.textContent).not.toMatch(/Spectral/);
    expect(container.textContent).not.toMatch(/Constellation/);
    expect(container.textContent).not.toMatch(/R☉|L☉/);
  });

  it('omits absent optional properties', () => {
    const { massSolar, luminositySolar, ageGyr, ...lean } = rigelMeta;
    void massSolar;
    void luminositySolar;
    void ageGyr;
    stubMeta({ famousStarsMeta: [lean], ready: true });
    const { container } = render(createElement(BodyDetailCard, { target: rigelTarget }));

    // Required rows still render… ('Spectral type' is both the row label and
    // its InfoTip title, so it appears more than once.)
    expect(screen.getAllByText('Spectral type').length).toBeGreaterThan(0);
    // …but the optional lines are dropped, not shown blank.
    expect(container.textContent).not.toMatch(/Mass/);
    expect(container.textContent).not.toMatch(/Age/);
    expect(container.textContent).not.toMatch(/Luminosity/);
  });
});
