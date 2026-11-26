// @vitest-environment jsdom

/** AsteroidDetailCard — the branches a reader would otherwise see as NaN, stale numbers or a wrong credit. */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { createElement } from 'react';
import AsteroidDetailCard from '../../../../../src/layers/asteroids/focus/ui/AsteroidDetailCard/AsteroidDetailCard';
import type { AsteroidInfo } from '../../../../../src/layers/asteroids/selection/@types/AsteroidInfo';

const INFO: AsteroidInfo = {
  type: 'asteroid',
  number: 3,
  label: '(3)',
  asteroidClass: 'mainBelt',
  positionMpc: [0, 0, 0],
  semiMajorAu: 2.6,
  eccentricity: 0.15,
  inclinationDeg: 8,
  periodYears: 4.19,
  absoluteMagnitude: null,
  measuredSize: null,
  epochJd: 2461200.5,
  now: { sunDistanceAu: 2.5, earthDistanceAu: 1.7, magnitude: null },
};

describe('AsteroidDetailCard', () => {
  it('card shows H unknown for a row with no H, and no now values outside the window', () => {
    const inside = render(createElement(AsteroidDetailCard, { target: INFO }));
    expect(inside.container.textContent).toContain('H unknown');
    expect(inside.container.textContent).not.toContain('NaN');
    expect(inside.container.textContent).toContain('From Earth');
    inside.unmount();
    const outside = render(createElement(AsteroidDetailCard, { target: { ...INFO, now: null } }));
    expect(outside.container.textContent).not.toContain('From the Sun');
    expect(outside.container.textContent).not.toContain('From Earth');
    expect(outside.container.textContent).toContain('Semi-major axis');
  });

  it('credits JPL in the source row only when the diameter is its measurement', () => {
    const text = (target: AsteroidInfo) => {
      const card = render(createElement(AsteroidDetailCard, { target }));
      const content = card.container.textContent;
      card.unmount();
      return content;
    };
    const measured = { ...INFO, measuredSize: { diameterKm: 16.84, albedo: 0.25 } };
    expect(text(measured)).toContain('Minor Planet Center, JPL');
    expect(text({ ...INFO, absoluteMagnitude: 10.39 })).toContain('Diameter (estimate)');
    expect(text({ ...INFO, absoluteMagnitude: 10.39 })).not.toContain('JPL');
  });
});
