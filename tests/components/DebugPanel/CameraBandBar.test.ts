// @vitest-environment jsdom

/**
 * CameraBandBar — the ruler is LOG, and a marker off the domain pins to the end
 * rather than escaping the strip: linear placement would bunch the whole band
 * against the left edge, and an unclamped marker would render outside the box
 * with no hint that it is off-scale.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { createElement } from 'react';

import CameraBandBar from '../../../src/components/DebugPanel/CameraBandBar';

function leftPercents(container: HTMLElement): number[] {
  return [...container.querySelectorAll<HTMLElement>('[style*="left"]')].map((el) =>
    Number.parseFloat(el.style.left),
  );
}

describe('CameraBandBar', () => {
  it('spaces equal h/R ratios equally', () => {
    const { container } = render(
      createElement(CameraBandBar, {
        ticks: [
          { label: 'a', hOverR: 0.1 },
          { label: 'b', hOverR: 1 },
          { label: 'c', hOverR: 10 },
        ],
        hOverR: null,
        markerLabel: '',
      }),
    );
    const [a, b, c] = leftPercents(container);
    expect(b! - a!).toBeCloseTo(c! - b!, 6);
  });

  it('pins an off-domain marker to the end and flags it', () => {
    const { container } = render(
      createElement(CameraBandBar, {
        ticks: [
          { label: 'a', hOverR: 0.1 },
          { label: 'b', hOverR: 1 },
        ],
        hOverR: 1e6,
        markerLabel: 'far',
      }),
    );
    expect(leftPercents(container).at(-1)).toBe(100);
    expect(container.textContent).toContain('› far');
  });
});
