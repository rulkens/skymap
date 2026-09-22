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
});
