// @vitest-environment jsdom
//
// StarDetailCard — rendering tests for the one star panel, a case per
// `detail.kind`. The card is the only place a star's rows are chosen, so a
// mis-wired arm shows up here rather than only in the browser. Asserting
// rendered text keeps the contract stable against CSS-module class mangling.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import StarDetailCard from '../../../src/components/InfoCard/StarDetailCard/StarDetailCard';
import { buildFocusable } from '../../../src/services/engine/helpers/buildFocusable';
import { SGR_A_STAR_ENTRY } from '../../../src/data/sources/sgr-a-star';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { Source } from '../../../src/data/sources';
import type { FamousStarMetaEntry } from '../../../src/@types/loading/FamousStarMetaEntry';
import type { StarInfo } from '../../../src/@types/engine/StarInfo';

// A Sun-like dwarf 12 pc out: absMag 4.67, BP−RP 0.82 (in range → no '~').
const fieldStar: StarInfo = {
  type: 'starCatalog',
  source: Source.GaiaStars,
  index: 0,
  id: null,
  displayName: 'Field star',
  x: 12 * SCALE_UNITS.PC_TO_MPC,
  y: 0,
  z: 0,
  distancePc: 12,
  detail: {
    kind: 'photometry',
    absMag: 4.67,
    apparentMag: 5.0,
    bpRp: 0.82,
    spectralClass: 'G',
  },
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

const rigel: StarInfo = {
  type: 'starCatalog',
  source: Source.FamousStar,
  index: 1,
  id: 'rigel',
  displayName: 'Rigel',
  x: 264.6 * SCALE_UNITS.PC_TO_MPC,
  y: 0,
  z: 0,
  distancePc: 264.6,
  detail: { kind: 'curated', meta: rigelMeta },
};

describe('StarDetailCard', () => {
  it('photometry: the catalogued rows and the three derived estimates it implies', () => {
    render(createElement(StarDetailCard, { target: fieldStar }));

    expect(screen.getByText('Absolute mag')).toBeInTheDocument();
    expect(screen.getByText('4.67')).toBeInTheDocument();
    expect(screen.getByText('Temperature')).toBeInTheDocument();
    expect(screen.getByText('5,684 K')).toBeInTheDocument();
    expect(screen.getByText('Luminosity')).toBeInTheDocument();
    expect(screen.getByText('1.02 L☉')).toBeInTheDocument();
    expect(screen.getByText('Radius')).toBeInTheDocument();
    expect(screen.getByText('1.04 R☉')).toBeInTheDocument();
  });

  it("photometry: prefixes '~' when the colour is outside the relation's range", () => {
    // BP−RP 0.2 is bluer than the dwarf relation's 0.39 hot edge → extrapolated.
    const blue: StarInfo = {
      ...fieldStar,
      detail: {
        kind: 'photometry',
        absMag: 6.0,
        apparentMag: 6.4,
        bpRp: 0.2,
        spectralClass: 'A/F',
      },
    };
    render(createElement(StarDetailCard, { target: blue }));

    expect(screen.getByText(/^~[\d,]+ K$/)).toBeInTheDocument();
  });

  it('curated: aliases, the sidecar rows, the description and the Wikipedia link', () => {
    render(createElement(StarDetailCard, { target: rigel }));

    expect(screen.getByText('Rigel')).toBeInTheDocument();
    // Aliases come from names.slice(1) — the primary name heads the card.
    expect(screen.getByText(/Beta Orionis/)).toBeInTheDocument();
    expect(screen.getByText('B8Ia')).toBeInTheDocument();
    expect(screen.getByText('12,100 K')).toBeInTheDocument();
    expect(screen.getByText(rigelMeta.description)).toBeInTheDocument();
    // "Learn more" Wikipedia link — Rigel's primary name is the article slug.
    expect(screen.getByRole('link', { name: 'Wikipedia' })).toHaveAttribute(
      'href',
      'https://en.wikipedia.org/wiki/Rigel',
    );
  });

  it("orbit: an S-star's period, eccentricity, pericentre and pericentre speed", () => {
    // End to end through the real seam: a stored star row for S2 goes through
    // buildFocusable's static seed lookup and out as rendered rows, so a missing
    // lookup or an unwired card block fails here rather than only in the browser.
    const target = buildFocusable(
      {
        type: 'starCatalog',
        source: Source.SStar,
        index: 0,
        id: 's2',
        label: 'S2',
        positionMpc: [0.0025, 0, 0],
        radiusM: 4.2e9,
      },
      [],
    ) as StarInfo;

    const { container } = render(createElement(StarDetailCard, { target }));

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

  it('none: the headline alone, and no distance row at the origin', () => {
    // The Sun: nothing of its own yet, and it sits at the frame's origin, so its
    // own distance row would read "0 m" — a fact about the frame, not the star.
    const sun: StarInfo = {
      type: 'starCatalog',
      source: Source.Sun,
      index: 0,
      id: 'sun',
      displayName: 'Sun',
      x: 0,
      y: 0,
      z: 0,
      distancePc: 0,
      detail: { kind: 'none' },
    };
    const { container } = render(createElement(StarDetailCard, { target: sun }));

    expect(screen.getByText('Sun')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Distance|Spectral|Temperature|Orbits/);
  });
});
