// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
    ...overrides,
  };
  render(<Dock {...props} />);
  return props;
}

describe('Dock', () => {
  // Near-identical items: the bug to catch is one wired to its neighbour's flag or handler.
  it('marks only the open item as pressed and routes each tap to its own handler', () => {
    const props = renderDock({ layersOpen: true });
    const time = screen.getByRole('button', { name: 'Time' });
    const layers = screen.getByRole('button', { name: 'Layers' });

    expect(time).toHaveAttribute('aria-pressed', 'false');
    expect(layers).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(time);
    expect(props.onTime).toHaveBeenCalledTimes(1);
    expect(props.onLayers).not.toHaveBeenCalled();
  });

  // Home and Search act once; a stray aria-pressed would announce them as stuck toggles.
  it('routes Home and Search to their own handlers and leaves them without a pressed state', () => {
    const props = renderDock();
    const home = screen.getByRole('button', { name: 'Home' });
    const search = screen.getByRole('button', { name: 'Search' });
    expect(home).not.toHaveAttribute('aria-pressed');
    expect(search).not.toHaveAttribute('aria-pressed');
    fireEvent.click(search);
    expect(props.onSearch).toHaveBeenCalledTimes(1);
    expect(props.onHome).not.toHaveBeenCalled();
    fireEvent.click(home);
    expect(props.onHome).toHaveBeenCalledTimes(1);
  });

  // The glyph is aria-hidden, so the run state has to be in the name or a screen reader never hears it.
  it('names the Time item by what it says, including the run state the glyph shows', () => {
    renderDock({ timeLabel: { text: '22 Oct', glyph: '❚❚', name: 'Time, 22 Oct 2026, paused' } });
    const time = screen.getByRole('button', { name: 'Time, 22 Oct 2026, paused' });
    expect(time).toHaveTextContent('22 Oct ❚❚');
  });
});
