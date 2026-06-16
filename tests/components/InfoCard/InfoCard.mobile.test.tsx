// @vitest-environment jsdom
//
// InfoCard mobile branch — when `useIsMobile()` is true the card collapses to a
// single MobileSheet showing ONLY the selected target's full detail body
// (hovered is ignored entirely; nothing renders without a selection).  Desktop
// keeps today's hovered+selected stacking.
//
// `useIsMobile` reads `window.matchMedia('(max-width: 768px)').matches`, so we
// drive the branch by stubbing `matchMedia` per test: `matches: true` →
// mobile, `false` → desktop.  We assert on user-visible text, not CSS-module
// class fragments (mangled names aren't a stable contract).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { InfoCard } from '../../../src/components/InfoCard/InfoCard';
import type { StructureInfo } from '../../../src/@types/data/structure/StructureInfo';
import type { GalaxyInfo } from '../../../src/@types/engine/GalaxyInfo';

const virgo: StructureInfo = {
  type: 'structure',
  id: 'virgo-m87',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  featured: true,
  physicalRadiusMpc: 2.2,
};
const coma: StructureInfo = {
  type: 'structure',
  id: 'coma',
  name: 'Coma Cluster',
  category: 'cluster',
  worldPos: [0, 100, 0],
  featured: true,
  physicalRadiusMpc: 6,
};

// Minimal GalaxyInfo stub — GalaxyDetailCard reads many fields; supplying zero /
// empty values keeps the galaxy branch from throwing.  Cast away the precise
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

// Stub matchMedia so useIsMobile resolves to the requested breakpoint state.
function setMatchMedia(matches: boolean): void {
  window.matchMedia = vi.fn<(query: string) => MediaQueryList>(
    (query: string) =>
      ({
        matches,
        media: query,
        onchange: null,
        addEventListener: vi.fn<MediaQueryList['addEventListener']>(),
        removeEventListener: vi.fn<MediaQueryList['removeEventListener']>(),
        addListener: vi.fn<MediaQueryList['addListener']>(),
        removeListener: vi.fn<MediaQueryList['removeListener']>(),
        dispatchEvent: vi.fn<MediaQueryList['dispatchEvent']>(),
      }) as unknown as MediaQueryList,
  );
}

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe('InfoCard mobile branch', () => {
  describe('mobile', () => {
    beforeEach(() => setMatchMedia(true));

    it('renders only the selected card on mobile and ignores hovered', () => {
      render(
        createElement(InfoCard, {
          hovered: virgo,
          selected: coma,
        }),
      );
      expect(screen.getByText('Coma Cluster')).toBeInTheDocument();
      expect(screen.queryByText('Virgo Cluster')).not.toBeInTheDocument();
    });

    it('renders nothing on mobile when nothing is selected even if hovered', () => {
      const { container } = render(
        createElement(InfoCard, {
          hovered: virgo,
          selected: null,
        }),
      );
      expect(screen.queryByText('Virgo Cluster')).not.toBeInTheDocument();
      expect(container).toBeEmptyDOMElement();
    });

    it('shows the peek content for a selected structure on mobile', () => {
      render(
        createElement(InfoCard, {
          hovered: null,
          selected: virgo,
        }),
      );
      // Name headline, the category-label badge, and the formatted distance
      // value are all present in the sheet body.  We assert the value
      // ("10.0 Mpc / …") rather than the label "Distance" because the
      // InfoTip wrapping the label also carries "Distance" as its title,
      // which produces two matches and makes getByText ambiguous.
      expect(screen.getByText('Virgo Cluster')).toBeInTheDocument();
      expect(screen.getByText('Galaxy Cluster')).toBeInTheDocument();
      expect(screen.getByText(/10\.0 Mpc/)).toBeInTheDocument();
    });

    it('keeps the full detail body in the DOM on mobile', () => {
      render(
        createElement(InfoCard, {
          hovered: null,
          selected: galaxyStub,
        }),
      );
      // "RA" is a below-fold reference row inside the <details> block; it lives
      // in the DOM regardless of the disclosure's open state.
      expect(screen.getByText('RA')).toBeInTheDocument();
    });
  });

  describe('desktop', () => {
    beforeEach(() => setMatchMedia(false));

    it("renders today's stack on desktop", () => {
      render(
        createElement(InfoCard, {
          hovered: virgo,
          selected: coma,
        }),
      );
      // Desktop stacking parity: pinned Coma plus the hovered Virgo preview.
      expect(screen.getByText('Coma Cluster')).toBeInTheDocument();
      expect(screen.getByText('Virgo Cluster')).toBeInTheDocument();
    });
  });
});
