// @vitest-environment jsdom
//
// CardHeader owns the card's name, and the phone sheet (hasChrome=false) moves
// the card-shot into it. The contract pinned here: the image shows exactly once
// per arrangement — beside the rows with chrome, in the header without — and a
// card with no shot gets no thumbnail slot at all.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import CardHeader from '../../../src/components/InfoCard/CardHeader/CardHeader';
import BodyDetailCard from '../../../src/components/InfoCard/BodyDetailCard/BodyDetailCard';
import type { BodyInfo } from '../../../src/@types/engine/BodyInfo';

const body = (id: string, label: string): BodyInfo => ({
  type: 'body',
  id,
  label,
  positionMpc: [0, 0, 0],
});

describe('CardHeader', () => {
  it('renders the name, the optional badge and a Focus + Close pair', () => {
    render(
      createElement(CardHeader, {
        eyebrow: 'Galaxy',
        title: 'M31',
        badge: 'Famous',
        onFocus: () => {},
        onClose: () => {},
      }),
    );
    expect(screen.getByText('M31')).toBeInTheDocument();
    expect(screen.getByText('Famous')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Focus camera' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear selection' })).toBeInTheDocument();
  });
});

describe('detail card thumbnail placement', () => {
  it('shows a body shot once, beside the rows, when the card has chrome', () => {
    const { container } = render(createElement(BodyDetailCard, { target: body('mars', 'Mars') }));
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(container.querySelector('img')?.closest('[class*="cardTopRow"]')).not.toBeNull();
  });

  it('moves the shot into the header, and out of the body, when chromeless', () => {
    const { container } = render(
      createElement(BodyDetailCard, { target: body('mars', 'Mars'), hasChrome: false }),
    );
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(container.querySelector('img')?.closest('[class*="cardTopRow"]')).toBeNull();
  });

  it('leaves no thumbnail slot for a body without a shot', () => {
    const { container } = render(
      createElement(BodyDetailCard, { target: body('ganymede', 'Ganymede'), hasChrome: false }),
    );
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });
});
