// @vitest-environment jsdom
//
// InfoCard — Milky Way routing tests.  A milkyWay selection renders the MW
// detail card (glyph, no thumbnail) and the CardHeader "Focus" pill focuses
// MILKY_WAY_INFO; a milkyWay hover renders the compact preview.  A galaxy
// selection still renders the galaxy card (the table dispatch didn't
// mis-route).
//
// Asserts on user-visible text rather than CSS-modules class fragments.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import InfoCard from '../../../src/components/InfoCard/InfoCard';
import { MILKY_WAY_INFO } from '../../../src/data/milkyWay/milkyWayInfo';
import type { GalaxyInfo } from '../../../src/@types/engine/GalaxyInfo';
import type { FocusableTarget } from '../../../src/@types/engine/FocusableTarget';

// Minimal GalaxyInfo stub for the regression case — same shape used by the
// sibling InfoCard tests.
const galaxyStub = {
  type: 'galaxyCatalog',
  index: 42,
  displayName: 'NGC 1234',
  sourceLabel: 'SDSS',
  lookbackGyr: 0.5,
  earthEra: 'Modern',
  distanceMpc: 100,
  galaxyType: { description: 'Spiral', category: 'spiral' },
  objID: 0n,
  x: 0,
  y: 0,
  z: 0,
  ra: 0,
  dec: 0,
  raSexagesimal: '00h00m00s',
  decSexagesimal: '+00d00m00s',
  redshift: 0,
  hubbleVelocityKmS: 0,
  magU: 0,
  magG: 0,
  magR: 0,
  magI: 0,
  magZ: 0,
  bands: { u: 'u', g: 'g', r: 'r', i: 'i', z: 'z' },
  colours: [],
  absoluteMagG: 0,
  iauName: 'IAU NGC 1234',
  source: 0,
  catalogues: [],
  diameterKpc: 30,
  diameterProvenance: 'fallback (30 kpc)',
  orientation: { axisRatio: 1, positionAngleDeg: 0, provenance: 'fallback' },
  thumbnailUrl: '',
} as unknown as GalaxyInfo;

describe('InfoCard Milky Way', () => {
  it('renders the Milky Way card for a milkyWay selection (no thumbnail)', () => {
    const { container } = render(
      createElement(InfoCard, { hovered: null, selected: MILKY_WAY_INFO }),
    );
    expect(screen.getByText('Milky Way')).toBeInTheDocument();
    expect(screen.getByText(MILKY_WAY_INFO.description)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it("the Milky Way card's Focus button calls onFocus with MILKY_WAY_INFO", () => {
    const onFocus = vi.fn<(t: FocusableTarget) => void>();
    render(createElement(InfoCard, { hovered: null, selected: MILKY_WAY_INFO, onFocus }));
    fireEvent.click(screen.getByText('Focus'));
    expect(onFocus).toHaveBeenCalledWith(MILKY_WAY_INFO);
  });

  it('renders the compact Milky Way card on hover', () => {
    const { container } = render(
      createElement(InfoCard, { hovered: MILKY_WAY_INFO, selected: null }),
    );
    expect(screen.getByText('Milky Way')).toBeInTheDocument();
    // Compact variant's title row says "Hover".
    expect(screen.getByText('Hover')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('a galaxy selection still renders the galaxy card (regression)', () => {
    render(createElement(InfoCard, { hovered: null, selected: galaxyStub }));
    expect(screen.getByText('NGC 1234')).toBeInTheDocument();
  });
});
