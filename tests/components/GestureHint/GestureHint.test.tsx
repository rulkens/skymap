// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';

import GestureHint from '../../../src/components/GestureHint/GestureHint';

const hint = (look: boolean, zoom: boolean) =>
  createElement(GestureHint, { gestures: ['look', 'zoom'], learned: { look, zoom } });

describe('GestureHint', () => {
  it('never shows a gesture learned before it mounted', () => {
    render(hint(true, false));
    expect(screen.queryByText('Drag to look around')).toBeNull();
    expect(screen.getByText('Scroll to zoom')).toBeTruthy();
  });

  it('drops a segment learned while shown once its own fade ends, then the chip', () => {
    const { rerender, container } = render(hint(false, false));
    rerender(hint(true, false));
    const look = screen.getByText('Drag to look around').parentElement!;
    // The next segment's divider fading is not this segment's fade.
    fireEvent.transitionEnd(screen.getByText('Scroll to zoom').parentElement!);
    fireEvent.transitionEnd(look);
    expect(screen.queryByText('Drag to look around')).toBeNull();
    expect(screen.getByText('Scroll to zoom')).toBeTruthy();

    rerender(hint(true, true));
    fireEvent.transitionEnd(screen.getByText('Scroll to zoom').parentElement!);
    expect(container.firstChild).toBeNull();
  });
});
