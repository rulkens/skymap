// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import AboutPill from '../../../src/components/Splash/AboutPill';

describe('AboutPill', () => {
  it('renders a button with the aria-label "About skymap"', () => {
    render(createElement(AboutPill, { onClick: () => {} }));
    expect(screen.getByRole('button', { name: /about skymap/i })).toBeInTheDocument();
  });

  it('fires onClick when clicked', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(createElement(AboutPill, { onClick }));
    await user.click(screen.getByRole('button', { name: /about skymap/i }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('fires onClick on Enter (keyboard accessibility)', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(createElement(AboutPill, { onClick }));
    screen.getByRole('button', { name: /about skymap/i }).focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('reflects hidden=true via aria-hidden (matches SearchTrigger / AutoRotateToggle)', () => {
    render(createElement(AboutPill, { onClick: () => {}, hidden: true }));
    const btn = screen.getByRole('button', { hidden: true });
    expect(btn).toHaveAttribute('aria-hidden', 'true');
  });

  it('omits aria-hidden when hidden=false (default)', () => {
    render(createElement(AboutPill, { onClick: () => {} }));
    const btn = screen.getByRole('button', { name: /about skymap/i });
    expect(btn).not.toHaveAttribute('aria-hidden');
  });
});
