// @vitest-environment jsdom
//
// InfoCard hoveredPoi prop — routing tests covering the new POI hover
// preview branch and its suppression rule.
//
// We assert on user-visible text rather than CSS-modules class fragments
// because the CSS-modules-mangled class names aren't stable across
// renames; rendered text is the stable contract for the user.
//
// The "suppressed when same POI is pinned" case looks at the rendered
// DOM structure: the pinned FullCard shows "Pinned" in its title row, and
// the compact hover preview's title row says "Hover".  We count the
// "Hover" occurrences — when the same POI is pinned, the suppression
// rule should keep that count at zero.

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { createElement } from 'react';
import { InfoCard } from '../../../src/components/InfoCard/InfoCard';
import type { PointOfInterest } from '../../../src/@types/engine/subsystems/PointOfInterest';
import type { GalaxyInfo } from '../../../src/@types/engine/GalaxyInfo';

const virgo: PointOfInterest = {
  id: 'virgo-m87',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  physicalRadiusMpc: 2.2,
};
const coma: PointOfInterest = {
  id: 'coma',
  name: 'Coma Cluster',
  category: 'cluster',
  worldPos: [0, 100, 0],
  physicalRadiusMpc: 6,
};

// Minimal GalaxyInfo stub for the "stack alongside pinned galaxy" case.
// FullCard / CompactCard read several fields; we only need enough for
// the FullCard's galaxy branch to render without throwing.  Cast away
// the precise type because populating every field would obscure the
// test's intent.
const galaxyStub = {
  index: 42,
  displayName: 'NGC 1234',
  sourceLabel: 'SDSS',
  lookbackGyr: 0.5,
  earthEra: 'Modern',
  distanceMpc: 100,
  galaxyType: { description: 'Spiral', category: 'spiral' },
  // Minimal fields needed by FullCard's galaxy branch — most are read
  // and rendered; supplying zero / empty values keeps it from crashing.
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
  catalogUrl: null,
  diameterKpc: 30,
  diameterProvenance: 'fallback (30 kpc)',
  orientation: { axisRatio: 1, positionAngleDeg: 0, provenance: 'fallback' },
  thumbnailUrl: '',
} as unknown as GalaxyInfo;

describe('InfoCard hoveredPoi prop', () => {
  it('renders the POI hover preview when only hoveredPoi is set', () => {
    render(
      createElement(InfoCard, {
        hovered: null,
        selected: null,
        hoveredPoi: virgo,
      }),
    );
    // Virgo's name appears in the compact preview headline.
    expect(screen.getByText('Virgo Cluster')).toBeInTheDocument();
    // The compact card's title row says "Hover".  Confirms it's the
    // compact preview, not the full pinned card.
    expect(screen.getByText('Hover')).toBeInTheDocument();
  });

  it('suppresses the POI hover preview when the SAME POI is already pinned', () => {
    render(
      createElement(InfoCard, {
        hovered: null,
        selected: null,
        selectedPoi: virgo,
        hoveredPoi: virgo,
      }),
    );
    // Pinned full card shows "Virgo Cluster" once.  The compact preview
    // (which would also show "Virgo Cluster") MUST NOT appear.  Assert
    // exactly one occurrence — duplication would mean two cards rendered.
    const matches = screen.getAllByText('Virgo Cluster');
    expect(matches).toHaveLength(1);
    // And the suppression rule means no "Hover" eyebrow anywhere — the
    // full POI card uses a "POI" eyebrow, not "Hover".
    expect(screen.queryByText('Hover')).not.toBeInTheDocument();
  });

  it('shows the POI hover preview alongside a pinned DIFFERENT POI', () => {
    render(
      createElement(InfoCard, {
        hovered: null,
        selected: null,
        selectedPoi: coma,
        hoveredPoi: virgo,
      }),
    );
    // Both names appear: Coma in the pinned full card, Virgo in the
    // compact hover preview below it.
    expect(screen.getByText('Coma Cluster')).toBeInTheDocument();
    expect(screen.getByText('Virgo Cluster')).toBeInTheDocument();
  });

  it('shows the POI hover preview alongside a pinned galaxy', () => {
    render(
      createElement(InfoCard, {
        hovered: null,
        selected: galaxyStub,
        hoveredPoi: virgo,
      }),
    );
    // Virgo's name appears in the compact POI preview, stacked below the
    // pinned galaxy's full card.
    expect(screen.getByText('Virgo Cluster')).toBeInTheDocument();
    expect(screen.getByText('NGC 1234')).toBeInTheDocument();
  });
});
