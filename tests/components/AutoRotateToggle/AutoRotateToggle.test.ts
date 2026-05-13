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
});
