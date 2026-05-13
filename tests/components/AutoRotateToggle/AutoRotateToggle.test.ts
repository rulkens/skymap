// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import AutoRotateToggle from '../../../src/components/AutoRotateToggle/AutoRotateToggle';

describe('AutoRotateToggle', () => {
  it('renders a play icon when playing=false', () => {
    render(createElement(AutoRotateToggle, { playing: false, onToggle: () => {} }));
    const btn = screen.getByRole('button', { name: /start camera auto-rotate/i });
    expect(btn).toBeInTheDocument();
    expect(btn.querySelector('[data-testid="play-icon"]')).not.toBeNull();
  });

  it('renders a pause icon when playing=true', () => {
    render(createElement(AutoRotateToggle, { playing: true, onToggle: () => {} }));
    const btn = screen.getByRole('button', { name: /pause camera auto-rotate/i });
    expect(btn).toBeInTheDocument();
    expect(btn.querySelector('[data-testid="pause-icon"]')).not.toBeNull();
  });

  it('fires onToggle when the user clicks', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(createElement(AutoRotateToggle, { playing: false, onToggle }));
    await user.click(screen.getByRole('button', { name: /start camera auto-rotate/i }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('fires onToggle on Enter when focused (keyboard accessibility)', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(createElement(AutoRotateToggle, { playing: false, onToggle }));
    const btn = screen.getByRole('button', { name: /start camera auto-rotate/i });
    btn.focus();
    await user.keyboard('{Enter}');
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('reflects hidden=true via aria-hidden, mirroring SearchTrigger', () => {
    render(
      createElement(AutoRotateToggle, { playing: false, onToggle: () => {}, hidden: true }),
    );
    const btn = screen.getByRole('button', { hidden: true });
    expect(btn).toHaveAttribute('aria-hidden', 'true');
  });

  it('omits aria-hidden when hidden is false (default)', () => {
    render(createElement(AutoRotateToggle, { playing: false, onToggle: () => {} }));
    const btn = screen.getByRole('button', { name: /start camera auto-rotate/i });
    expect(btn).not.toHaveAttribute('aria-hidden');
  });

  it('sets aria-pressed="false" when playing=false', () => {
    render(createElement(AutoRotateToggle, { playing: false, onToggle: () => {} }));
    const btn = screen.getByRole('button', { name: /start camera auto-rotate/i });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  it('sets aria-pressed="true" when playing=true', () => {
    render(createElement(AutoRotateToggle, { playing: true, onToggle: () => {} }));
    const btn = screen.getByRole('button', { name: /pause camera auto-rotate/i });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('uses the "Start" aria-label when not playing', () => {
    render(createElement(AutoRotateToggle, { playing: false, onToggle: () => {} }));
    expect(
      screen.getByRole('button', { name: 'Start camera auto-rotate' }),
    ).toBeInTheDocument();
  });

  it('uses the "Pause" aria-label when playing', () => {
    render(createElement(AutoRotateToggle, { playing: true, onToggle: () => {} }));
    expect(
      screen.getByRole('button', { name: 'Pause camera auto-rotate' }),
    ).toBeInTheDocument();
  });
});
