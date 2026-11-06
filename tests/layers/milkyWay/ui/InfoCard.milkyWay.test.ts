// @vitest-environment jsdom
//
// InfoCard — Milky Way routing tests.  A milkyWay selection renders the MW
// detail card (card-shot thumbnail) and the CardHeader "Focus" pill focuses
// the Milky Way target; a milkyWay hover renders the compact preview.
//
// Asserts on user-visible text rather than CSS-modules class fragments.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import InfoCard from '../../../../src/components/InfoCard/InfoCard';
import { MILKY_WAY_INFO } from '../../../../src/data/milkyWay/milkyWayInfo';
import type { FocusableTargetBase } from '../../../../src/@types/engine/selection/FocusableTargetBase';

const MILKY_WAY_TARGET: FocusableTargetBase = { ...MILKY_WAY_INFO, ref: { type: 'milkyWay' } };

describe('InfoCard Milky Way', () => {
  it('renders the Milky Way card for a milkyWay selection with its card-shot thumbnail', () => {
    render(createElement(InfoCard, { hovered: null, selected: MILKY_WAY_TARGET }));
    expect(screen.getByText('Milky Way')).toBeInTheDocument();
    expect(screen.getByText(MILKY_WAY_INFO.description)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Milky Way thumbnail' })).toHaveAttribute(
      'src',
      '/images/featured/milkyWay.webp',
    );
    // Fact rows: diameter derives from MILKY_WAY_DISC_RADIUS_KPC, black-hole
    // mass from SGR_A_STAR_MASS_SOLAR — both should show their derived value.
    expect(screen.getByText(/35\.0 kpc/)).toBeInTheDocument();
    expect(screen.getByText(/Sgr A\* · 4\.3 × 10⁶ M☉/)).toBeInTheDocument();
  });

  it("the Milky Way card's Focus button calls onFocus with the Milky Way target", () => {
    const onFocus = vi.fn<(t: FocusableTargetBase) => void>();
    render(createElement(InfoCard, { hovered: null, selected: MILKY_WAY_TARGET, onFocus }));
    fireEvent.click(screen.getByText('Focus'));
    expect(onFocus).toHaveBeenCalledWith(MILKY_WAY_TARGET);
  });

  it('renders the compact Milky Way card on hover', () => {
    const { container } = render(
      createElement(InfoCard, { hovered: MILKY_WAY_TARGET, selected: null }),
    );
    expect(screen.getByText('Milky Way')).toBeInTheDocument();
    // Compact variant's title row says "Hover".
    expect(screen.getByText('Hover')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});
