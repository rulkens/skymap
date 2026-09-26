// @vitest-environment jsdom
//
// InfoCard — Milky Way routing tests.  A milkyWay selection renders the MW
// detail card (card-shot thumbnail) and the CardHeader "Focus" pill focuses
// MILKY_WAY_INFO; a milkyWay hover renders the compact preview.
//
// Asserts on user-visible text rather than CSS-modules class fragments.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import InfoCard from '../../../../src/components/InfoCard/InfoCard';
import { MILKY_WAY_INFO } from '../../../../src/data/milkyWay/milkyWayInfo';
import type { FocusableTarget } from '../../../../src/@types/engine/FocusableTarget';

describe('InfoCard Milky Way', () => {
  it('renders the Milky Way card for a milkyWay selection with its card-shot thumbnail', () => {
    render(createElement(InfoCard, { hovered: null, selected: MILKY_WAY_INFO }));
    expect(screen.getByText('Milky Way')).toBeInTheDocument();
    expect(screen.getByText(MILKY_WAY_INFO.description)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Milky Way thumbnail' })).toHaveAttribute(
      'src',
      '/images/featured/milkyWay.webp',
    );
  });

  it("the Milky Way card's Focus button calls onFocus with MILKY_WAY_INFO", () => {
    const onFocus = vi.fn<(t: FocusableTarget) => void>();
    render(createElement(InfoCard, { hovered: null, selected: MILKY_WAY_INFO, onFocus }));
    fireEvent.click(screen.getByText('Focus'));
    expect(onFocus).toHaveBeenCalledWith(MILKY_WAY_INFO);
  });

  it('renders the compact Milky Way card on hover', () => {
    const { container } = render(
      createElement(InfoCard, { hovered: MILKY_WAY_INFO, selected: null }),
    );
    expect(screen.getByText('Milky Way')).toBeInTheDocument();
    // Compact variant's title row says "Hover".
    expect(screen.getByText('Hover')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});
