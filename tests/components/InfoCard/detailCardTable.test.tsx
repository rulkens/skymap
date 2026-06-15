// @vitest-environment jsdom
//
// DETAIL_CARD — table-dispatch coverage.  One test per focusable arm for both
// the Detail and Compact variants: the galaxy rows render galaxy-only chrome
// (the "Galaxy" eyebrow / source badge), the structure rows render the
// structure name + its member-count row.  Asserting on rendered text keeps the
// contract stable against CSS-modules class mangling.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DETAIL_CARD } from '../../../src/components/InfoCard/detailCardTable';
import type { StructureInfo } from '../../../src/@types/data/structure/StructureInfo';
import type { GalaxyInfo } from '../../../src/@types/engine/GalaxyInfo';

const structure: StructureInfo = {
  type: 'structure',
  id: 'virgo-m87',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  featured: true,
  physicalRadiusMpc: 2.2,
};

// Minimal GalaxyInfo stub — GalaxyDetailCard / CompactCard read a handful of
// fields; supplying zero/empty values keeps the render from throwing.  Cast
// because populating every field would obscure the test's intent.
const galaxy = {
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

describe('DETAIL_CARD', () => {
  it('galaxyCatalog.Detail renders galaxy chrome for a GalaxyInfo', () => {
    render(<>{DETAIL_CARD.galaxyCatalog.Detail({ target: galaxy, pinned: true })}</>);
    expect(screen.getByText('NGC 1234')).toBeInTheDocument();
    // Galaxy-only chrome: the "Galaxy" eyebrow distinguishes it from a structure card.
    expect(screen.getByText('Galaxy')).toBeInTheDocument();
  });

  it('galaxyCatalog.Compact renders the galaxy hover preview', () => {
    render(<>{DETAIL_CARD.galaxyCatalog.Compact({ target: galaxy })}</>);
    expect(screen.getByText('NGC 1234')).toBeInTheDocument();
    expect(screen.getByText('Hover')).toBeInTheDocument();
  });

  it('structure.Detail renders the structure name and member-count row', () => {
    render(
      <>
        {DETAIL_CARD.structure.Detail({
          target: structure,
          pinned: true,
          selectedMemberCount: 137,
        })}
      </>,
    );
    expect(screen.getByText('Virgo Cluster')).toBeInTheDocument();
    // The member-count row only renders when selectedMemberCount is threaded through.
    expect(screen.getByText('Galaxies')).toBeInTheDocument();
    expect(screen.getByText('137')).toBeInTheDocument();
  });

  it('structure.Compact renders the structure hover preview', () => {
    render(<>{DETAIL_CARD.structure.Compact({ target: structure })}</>);
    expect(screen.getByText('Virgo Cluster')).toBeInTheDocument();
    expect(screen.getByText('Hover')).toBeInTheDocument();
  });
});
