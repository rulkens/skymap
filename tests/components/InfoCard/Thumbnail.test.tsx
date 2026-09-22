// @vitest-environment jsdom
//
// Thumbnail — regression for the "card stays mounted, url changes" case: a
// GalaxyDetailCard/BodyDetailCard doesn't remount on a new palette-search
// target, so Thumbnail's own state must follow prop changes without a `key`.

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import Thumbnail from '../../../src/components/InfoCard/Thumbnail/Thumbnail';

describe('Thumbnail', () => {
  it('shows the new url after a rerender, without remounting', () => {
    const { rerender } = render(createElement(Thumbnail, { url: '/a.webp', alt: 'x' }));
    expect(screen.getByRole('img', { name: 'x' })).toHaveAttribute('src', '/a.webp');

    rerender(createElement(Thumbnail, { url: '/b.webp', alt: 'x' }));
    expect(screen.getByRole('img', { name: 'x' })).toHaveAttribute('src', '/b.webp');
  });

  it('resets the errored placeholder when the url changes after a load failure', () => {
    const { rerender } = render(createElement(Thumbnail, { url: '/missing.webp', alt: 'x' }));

    fireEvent.error(screen.getByRole('img', { name: 'x' }));
    expect(screen.getByLabelText('No image available')).toBeInTheDocument();

    rerender(createElement(Thumbnail, { url: '/c.webp', alt: 'x' }));
    expect(screen.getByRole('img', { name: 'x' })).toHaveAttribute('src', '/c.webp');
  });
});
