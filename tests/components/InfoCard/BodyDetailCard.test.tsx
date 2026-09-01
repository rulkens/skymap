// @vitest-environment jsdom
//
// BodyDetailCard — rendering tests for the rich focused-body panel.
//
// The card resolves its narrative/physical rows by looking `target.id` up in the
// `famousStarsMeta` prop its container supplies.  Each test passes that array
// directly, so the cases under test are just values: a resolved entry, an empty
// array (sidecar not settled, or a deployment without one), and an entry missing
// its optional fields.  Asserting on rendered text keeps the contract stable
// against CSS-modules class mangling.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import BodyDetailCard from '../../../src/components/InfoCard/BodyDetailCard/BodyDetailCard';
import { buildFocusable } from '../../../src/services/engine/helpers/buildFocusable';
import { SGR_A_STAR_ENTRY } from '../../../src/data/sources/sgr-a-star';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { BodyInfo } from '../../../src/@types/engine/BodyInfo';
import type { FamousStarMetaEntry } from '../../../src/@types/loading/FamousStarMetaEntry';

const rigelTarget: BodyInfo = {
  type: 'body',
  id: 'rigel',
  label: 'Rigel',
  positionMpc: [0, 0, 0],
  radiusM: 55000000000,
};

// Jupiter is a non-star body: its id misses FAMOUS_STAR_IDS, so the card takes
// the lean branch (name + physical radius, no star-sidecar lookup).
const jupiterTarget: BodyInfo = {
  type: 'body',
  id: 'jupiter',
  label: 'Jupiter',
  positionMpc: [0, 0, 0],
  radiusM: 69911000,
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
  it('renders headline + also-known-as + description + Wikipedia link from resolved meta', () => {
    render(createElement(BodyDetailCard, { target: rigelTarget, famousStarsMeta: [rigelMeta] }));

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
    const { container } = render(
      createElement(BodyDetailCard, { target: rigelTarget, famousStarsMeta: [] }),
    );

    // Headline still shows from BodyInfo.label — a body is always selectable.
    expect(screen.getByText('Rigel')).toBeInTheDocument();
    // No properties block resolved, no crash.
    expect(container.textContent).not.toMatch(/Spectral/);
    expect(container.textContent).not.toMatch(/Temperature/);
  });

  it("shows a planet's fact sheet + Wikipedia link and omits the stellar rows", () => {
    // A non-star body must not consume the sidecar — even when a stellar entry
    // is present, no meta rows leak onto a planet card.  Jupiter's rows come
    // from the compiled-in BODY_FACTS table, not the star sidecar.
    const { container } = render(
      createElement(BodyDetailCard, { target: jupiterTarget, famousStarsMeta: [rigelMeta] }),
    );

    expect(screen.getByText('Jupiter')).toBeInTheDocument();
    // Radius stays first (straight off BodyInfo).
    expect(
      screen.getByText(`${(jupiterTarget.radiusM * SCALE_UNITS.M_TO_KM).toLocaleString()} km`),
    ).toBeInTheDocument();
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

  it('renders no orbital rows for a body that carries no elements', () => {
    // The optional field's absent path — every pre-existing body. A block that
    // rendered unconditionally would print empty or NaN rows on every planet.
    const { container } = render(
      createElement(BodyDetailCard, { target: jupiterTarget, famousStarsMeta: [] }),
    );

    expect(container.textContent).not.toMatch(/Eccentricity|Pericentre|Orbits/);
  });

  it("renders an S-star's period, eccentricity, pericentre and pericentre speed", () => {
    // End to end through the real seam: a stored body row for S2 goes through
    // buildFocusable's static seed lookup and out as rendered rows, so a missing
    // lookup or an unwired card block fails here rather than only in the browser.
    const target = buildFocusable({
      type: 'body',
      id: 's2',
      label: 'S2',
      positionMpc: [0, 0, 0],
      radiusM: 1000000000,
    }) as BodyInfo;

    const { container } = render(createElement(BodyDetailCard, { target, famousStarsMeta: [] }));

    // The focus the elements are fitted against, named rather than implied — as
    // the reader sees it named everywhere else, off the registry row.
    expect(screen.getByText(SGR_A_STAR_ENTRY.label)).toBeInTheDocument();
    // Straight off the Gillessen row — wrong star ⇒ wrong period and eccentricity.
    expect(screen.getByText('16.0 yr')).toBeInTheDocument();
    expect(screen.getByText('0.884')).toBeInTheDocument();
    // Derived rows: the AU/Schwarzschild pair and the speed the block exists for.
    expect(container.textContent).toMatch(/119 AU \(1,40\d Schwarzschild radii\)/);
    expect(container.textContent).toMatch(/7,69\d km\/s/);
  });

  it('omits absent optional properties', () => {
    const { massSolar, luminositySolar, ageGyr, ...lean } = rigelMeta;
    void massSolar;
    void luminositySolar;
    void ageGyr;
    const { container } = render(
      createElement(BodyDetailCard, { target: rigelTarget, famousStarsMeta: [lean] }),
    );

    // Required rows still render… ('Spectral type' is both the row label and
    // its InfoTip title, so it appears more than once.)
    expect(screen.getAllByText('Spectral type').length).toBeGreaterThan(0);
    // …but the optional lines are dropped, not shown blank.
    expect(container.textContent).not.toMatch(/Mass/);
    expect(container.textContent).not.toMatch(/Age/);
    expect(container.textContent).not.toMatch(/Luminosity/);
  });
});
