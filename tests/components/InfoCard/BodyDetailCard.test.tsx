// @vitest-environment jsdom
//
// BodyDetailCard — rendering tests for the rich focused-body panel.
//
// The card resolves its physical rows from the compiled-in BODY_FACTS table and
// the body's own seed, keyed on `target.id`. Asserting on rendered text keeps the
// contract stable against CSS-modules class mangling. Stars are not bodies —
// their rows live in StarDetailCard.test.tsx.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import BodyDetailCard from '../../../src/components/InfoCard/BodyDetailCard/BodyDetailCard';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { BodyInfo } from '../../../src/@types/engine/BodyInfo';
import { SCENE_BODIES } from '../../../src/data/bodies/sceneBodies';
import { findByIdOrThrow } from '../../../src/utils/object/findByIdOrThrow';
import { bodyFootprintRadiusM } from '../../../src/utils/scene/bodyFootprintRadiusM';
import { MARS_DATUM_RADIUS_M } from '../../../src/data/bodies/marsSurfaceParams';
import { formatDistance } from '../../../src/utils/format/formatDistance';

const JUPITER_RADIUS_M = bodyFootprintRadiusM(findByIdOrThrow(SCENE_BODIES, 'jupiter', 'test'));

const jupiterTarget: BodyInfo = {
  type: 'body',
  id: 'jupiter',
  label: 'Jupiter',
  positionMpc: [0, 0, 0],
};

describe('BodyDetailCard', () => {
  it("shows a planet's fact sheet + Wikipedia link", () => {
    const { container } = render(createElement(BodyDetailCard, { target: jupiterTarget }));

    expect(screen.getByText('Jupiter')).toBeInTheDocument();
    // Radius stays first (resolved off the seed, not the fact sheet).
    expect(
      screen.getByText(`${(JUPITER_RADIUS_M * SCALE_UNITS.M_TO_KM).toLocaleString()} km`),
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
    // No stellar rows on a body card — those belong to StarDetailCard now.
    expect(container.textContent).not.toMatch(/Spectral|Constellation|R☉|L☉|Eccentricity|Orbits/);
  });

  it("renders Mars's card-shot thumbnail with its Radius and Distance relocated into the summary", () => {
    // Mars is in SHOT_CARD_IDS (public/images/featured/body-mars.webp exists),
    // so the top row swaps in for the old radius/distance CardRow positions —
    // both must appear exactly once, not duplicated.
    const marsTarget: BodyInfo = {
      type: 'body',
      id: 'mars',
      label: 'Mars',
      positionMpc: [0, 0, 0],
    };

    render(createElement(BodyDetailCard, { target: marsTarget, distanceMpc: 1 }));

    const img = screen.getByRole('img', { name: 'Mars thumbnail' });
    expect(img).toHaveAttribute('src', '/images/featured/body-mars.webp');
    expect(
      screen.getAllByText(`${(MARS_DATUM_RADIUS_M * SCALE_UNITS.M_TO_KM).toLocaleString()} km`),
    ).toHaveLength(1);
    // The live camera-distance value (not Mars's fixed "Distance from Sun"
    // fact-sheet row, which stays put) must appear exactly once.
    expect(screen.getAllByText(formatDistance(1))).toHaveLength(1);
    // The summary column beside the shot holds four lines: radius, distance,
    // then mass and gravity — which therefore leave the row list below.
    const topRow = img.parentElement!.textContent;
    expect(topRow).toContain('0.107 M⊕');
    expect(topRow).toContain('0.38 g');
    // (Gravity's tooltip body also cites Mars's 0.38 g, so only mass is
    // counted for "appears once".)
    expect(screen.getAllByText('0.107 M⊕')).toHaveLength(1);
  });

  it('keeps the pre-thumbnail layout for a body with no card shot (Callisto)', () => {
    // Callisto has no captured shot, so the top row must not appear at all —
    // the rows stay exactly where they were before this feature.
    const callistoTarget: BodyInfo = {
      type: 'body',
      id: 'callisto',
      label: 'Callisto',
      positionMpc: [0, 0, 0],
    };

    const { container } = render(
      createElement(BodyDetailCard, { target: callistoTarget, distanceMpc: 1 }),
    );

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Callisto')).toBeInTheDocument();
    expect(screen.getByText('Distance')).toBeInTheDocument();
  });
});
