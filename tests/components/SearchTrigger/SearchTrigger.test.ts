// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { SearchTrigger } from '../../../src/components/SearchTrigger/SearchTrigger';

describe('SearchTrigger', () => {
  it('renders a button advertising galaxy search', () => {
    render(createElement(SearchTrigger, { onClick: () => {} }));
    expect(
      screen.getByRole('button', { name: /search galaxies/i }),
    ).toBeInTheDocument();
  });

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

  it('fires onClick on Enter when focused (keyboard accessibility)', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(createElement(SearchTrigger, { onClick }));
    const btn = screen.getByRole('button', { name: /search galaxies/i });
    btn.focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('reflects the hidden=true state via aria-hidden, not a class fragment', () => {
    // Pre-jsdom-switch this test asserted on the CSS-modules-mangled
    // class fragment "hidden", which broke if the SCSS file was
    // renamed.  ARIA attributes are the stable contract — let assistive
    // tech (and our tests) read them.
    render(createElement(SearchTrigger, { onClick: () => {}, hidden: true }));
    const btn = screen.getByRole('button', { hidden: true });
    expect(btn).toHaveAttribute('aria-hidden', 'true');
  });
});
