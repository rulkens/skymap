// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import SearchTrigger from '../../../src/components/SearchTrigger/SearchTrigger';

describe('SearchTrigger', () => {
  it('exposes Meta+K via aria-keyshortcuts so screen readers can surface it', () => {
    render(createElement(SearchTrigger, { onClick: () => {} }));
    const btn = screen.getByRole('button', { name: /search galaxies/i });
    expect(btn).toHaveAttribute('aria-keyshortcuts', expect.stringContaining('Meta+K'));
  });

  it('fires onClick when the user clicks the button', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(createElement(SearchTrigger, { onClick }));
    await user.click(screen.getByRole('button', { name: /search galaxies/i }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('reflects the hidden=true state via aria-hidden, not a class fragment', () => {
    // Asserting on aria-hidden rather than a CSS-modules-mangled class
    // fragment keeps the test stable across stylesheet renames — ARIA
    // attributes are the contract assistive tech (and this test) reads.
    render(createElement(SearchTrigger, { onClick: () => {}, hidden: true }));
    const btn = screen.getByRole('button', { hidden: true });
    expect(btn).toHaveAttribute('aria-hidden', 'true');
  });
});
