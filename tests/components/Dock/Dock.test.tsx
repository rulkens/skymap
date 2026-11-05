// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Dock from '../../../src/components/Dock/Dock';
import type { DockProps } from '../../../src/components/Dock/Dock';

function renderDock(overrides: Partial<DockProps> = {}) {
  const props: DockProps = {
    timeOpen: false,
    layersOpen: false,
    timeLabel: { text: 'Time', glyph: null, name: 'Time' },
    onHome: vi.fn<() => void>(),
    onSearch: vi.fn<() => void>(),
    onTime: vi.fn<() => void>(),
    onLayers: vi.fn<() => void>(),
    onAbout: vi.fn<() => void>(),
    ...overrides,
  };
  render(<Dock {...props} />);
  return props;
}

describe('Dock', () => {
  // Routing is covered through PhoneHudContainer.test; what only this level sees is the pressed semantics.
  it('presses only the open toggle; actions carry no pressed state', () => {
    renderDock({ layersOpen: true });
    expect(screen.getByRole('button', { name: 'Time' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Layers' })).toHaveAttribute('aria-pressed', 'true');
    for (const name of ['Home', 'Search', 'About skymap']) {
      expect(screen.getByRole('button', { name })).not.toHaveAttribute('aria-pressed');
    }
  });

  // The glyph is aria-hidden, so the run state has to be in the name or a screen reader never hears it.
  it('names the Time item by what it says, including the run state the glyph shows', () => {
    renderDock({ timeLabel: { text: '22 Oct', glyph: '❚❚', name: 'Time, 22 Oct 2026, paused' } });
    const time = screen.getByRole('button', { name: 'Time, 22 Oct 2026, paused' });
    expect(time).toHaveTextContent('22 Oct ❚❚');
  });
});
