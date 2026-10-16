// @vitest-environment jsdom
//
// The phone header doubles as the expanded sheet's drag zone: useSheetDrag only
// starts a drag on an open sheet from inside `[data-sheet-grip]`.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import CardHeader from '../../../src/components/InfoCard/CardHeader/CardHeader';

describe('CardHeader', () => {
  it('marks the phone header, Close button included, as the sheet grip', () => {
    render(
      createElement(CardHeader, {
        eyebrow: 'Galaxy',
        title: 'M31',
        layout: 'phone',
        onClose: () => {},
      }),
    );
    expect(
      screen.getByRole('button', { name: 'Clear selection' }).closest('[data-sheet-grip]'),
    ).not.toBeNull();
  });

  it('leaves the desktop header unmarked', () => {
    const { container } = render(createElement(CardHeader, { eyebrow: 'Galaxy', title: 'M31' }));
    expect(container.querySelector('[data-sheet-grip]')).toBeNull();
  });
});
