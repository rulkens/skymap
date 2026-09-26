// @vitest-environment jsdom
//
// InfoCard — selection-kind switch regression test.
//
// DetailCardEntry's Detail/Compact are typed as components (ComponentType),
// so InfoCard renders them as JSX (`<Detail .../>`) rather than calling them
// as plain functions. That boundary matters here: re-rendering the SAME
// InfoCard instance from one FocusableTarget kind to another (no unmount)
// must not change which component owns which hook calls at InfoCard's own
// position in the tree — calling a card as a function instead would run its
// hooks inside InfoCard's render, and a kind whose card hooks differently
// from the previous kind's would violate the rules of hooks. This exercises
// a galaxy → Milky Way → galaxy switch and asserts no throw, right card each
// time.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import InfoCard from '../../../src/components/InfoCard/InfoCard';
import { MILKY_WAY_INFO } from '../../../src/data/milkyWay/milkyWayInfo';
import type { GalaxyInfo } from '../../../src/@types/engine/GalaxyInfo';

// Minimal GalaxyInfo stub — GalaxyDetailCard reads many fields; supplying zero /
// empty values keeps the galaxy branch from throwing. Cast away the precise
// type because populating every field would obscure the test's intent.
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

describe('InfoCard selection-kind switch', () => {
  it('switches from a galaxy to the Milky Way and back without throwing', () => {
    const { rerender } = render(<InfoCard hovered={null} selected={galaxyStub} />);
    expect(screen.getByText('NGC 1234')).toBeInTheDocument();

    rerender(<InfoCard hovered={null} selected={MILKY_WAY_INFO} />);
    expect(screen.getByText('Milky Way')).toBeInTheDocument();
    expect(screen.queryByText('NGC 1234')).not.toBeInTheDocument();

    rerender(<InfoCard hovered={null} selected={galaxyStub} />);
    expect(screen.getByText('NGC 1234')).toBeInTheDocument();
    expect(screen.queryByText('Milky Way')).not.toBeInTheDocument();
  });
});
