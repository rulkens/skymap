// @vitest-environment jsdom
//
// InfoCard unified hovered/selected props — routing tests covering the
// structure hover preview branch and its suppression rule.
//
// Since Task 5 of the unify-focus-clear refactor, InfoCard accepts a single
// `hovered` and a single `selected` prop — each typed as
// `GalaxyInfo | StructureRecord | null` (the `FocusableTarget` union).
// The component dispatches via `isPoi` internally.  The old `hoveredStructure`
// / `selectedStructure` separate slots are gone.
//
// We assert on user-visible text rather than CSS-modules class fragments
// because the CSS-modules-mangled class names aren't stable across
// renames; rendered text is the stable contract for the user.
//
// The "suppressed when same structure is pinned" case looks at the rendered
// DOM structure: the pinned full card shows "Pinned" in its title row, and
// the compact hover preview's title row says "Hover".  We count the
// "Hover" occurrences — when the same structure is pinned, the suppression
// rule should keep that count at zero.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { InfoCard } from '../../../src/components/InfoCard/InfoCard';
import type { StructureRecord } from '../../../src/@types/engine/data/StructureRecord';
import type { GalaxyInfo } from '../../../src/@types/engine/GalaxyInfo';

const virgo: StructureRecord = {
  id: 'virgo-m87',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  featured: true,
  physicalRadiusMpc: 2.2,
};
const coma: StructureRecord = {
  id: 'coma',
  name: 'Coma Cluster',
  category: 'cluster',
  worldPos: [0, 100, 0],
  featured: true,
  physicalRadiusMpc: 6,
};

// Minimal GalaxyInfo stub for the "stack alongside pinned galaxy" case.
// GalaxyDetailCard / CompactCard read several fields; we only need enough for
// the galaxy branch to render without throwing.  Cast away the precise type
// because populating every field would obscure the test's intent.
const galaxyStub = {
  index: 42,
  displayName: 'NGC 1234',
  sourceLabel: 'SDSS',
  lookbackGyr: 0.5,
  earthEra: 'Modern',
  distanceMpc: 100,
  galaxyType: { description: 'Spiral', category: 'spiral' },
  // Minimal fields needed by the galaxy branch — most are read and
  // rendered; supplying zero / empty values keeps it from crashing.
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

describe('InfoCard hovered structure', () => {
  it('renders the structure hover preview when only a hovered structure is set', () => {
    render(
      createElement(InfoCard, {
        hovered: virgo,
        selected: null,
      }),
    );
    // Virgo's name appears in the compact preview headline.
    expect(screen.getByText('Virgo Cluster')).toBeInTheDocument();
    // The compact card's title row says "Hover".  Confirms it's the
    // compact preview, not the full pinned card.
    expect(screen.getByText('Hover')).toBeInTheDocument();
  });

  it('suppresses the structure hover preview when the SAME structure is already pinned', () => {
    render(
      createElement(InfoCard, {
        hovered: virgo,
        selected: virgo,
      }),
    );
    // Pinned full card shows "Virgo Cluster" once.  The compact preview
    // (which would also show "Virgo Cluster") MUST NOT appear.  Assert
    // exactly one occurrence — duplication would mean two cards rendered.
    const matches = screen.getAllByText('Virgo Cluster');
    expect(matches).toHaveLength(1);
    // And the suppression rule means no "Hover" eyebrow anywhere — the
    // full structure card uses a "Structure" eyebrow, not "Hover".
    expect(screen.queryByText('Hover')).not.toBeInTheDocument();
  });

  it('shows the structure hover preview alongside a pinned DIFFERENT structure', () => {
    render(
      createElement(InfoCard, {
        hovered: virgo,
        selected: coma,
      }),
    );
    // Both names appear: Coma in the pinned full card, Virgo in the
    // compact hover preview below it.
    expect(screen.getByText('Coma Cluster')).toBeInTheDocument();
    expect(screen.getByText('Virgo Cluster')).toBeInTheDocument();
  });

  it('shows the structure hover preview alongside a pinned galaxy', () => {
    render(
      createElement(InfoCard, {
        hovered: virgo,
        selected: galaxyStub,
      }),
    );
    // Virgo's name appears in the compact structure preview, stacked below
    // the pinned galaxy's full card.
    expect(screen.getByText('Virgo Cluster')).toBeInTheDocument();
    expect(screen.getByText('NGC 1234')).toBeInTheDocument();
  });
});
