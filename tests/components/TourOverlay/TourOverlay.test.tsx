// @vitest-environment jsdom
//
// TourOverlay presentational tests.
//
// These cover the three presentational pieces in isolation: the caption's
// readout + markdown body (TourCaption), the nav cluster's disabled/handler
// wiring + pause aria-label (TourNav), and the overlay's caption-gating
// behaviour (caption hidden during the fly, nav always shown).
//
// Handler mocks are typed `vi.fn<() => void>()` so they satisfy the props'
// `() => void` fields under tsc — a bare `vi.fn()` infers a too-wide type and
// fails the typecheck against the typed props.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TourCaption from '../../../src/components/TourOverlay/TourCaption';
import TourNav from '../../../src/components/TourOverlay/TourNav';
import TourOverlay from '../../../src/components/TourOverlay/TourOverlay';
import type { BeatCaption } from '../../../src/@types/animation/tour/BeatCaption';

describe('TourCaption', () => {
  it('renders the title and the zero-padded label readout', () => {
    const caption: BeatCaption = { title: 'The Virgo Cluster' };
    render(<TourCaption caption={caption} label="The Local Universe" index={0} total={3} />);

    expect(screen.getByText('The Virgo Cluster')).toBeInTheDocument();
    expect(screen.getByText('The Local Universe · 01 / 03')).toBeInTheDocument();
  });

  it('omits the label prefix when the tour has no label', () => {
    const caption: BeatCaption = { title: 'M87' };
    render(<TourCaption caption={caption} label={null} index={2} total={3} />);

    expect(screen.getByText('03 / 03')).toBeInTheDocument();
  });

  it('renders markdown body: bold becomes <strong>, links open in a new tab', () => {
    const caption: BeatCaption = {
      title: 'The Milky Way',
      body: 'Home — and a **bold** word, plus a [link](https://example.com).',
    };
    render(<TourCaption caption={caption} label={null} index={0} total={1} />);

    const strong = screen.getByText('bold');
    expect(strong.tagName).toBe('STRONG');

    const link = screen.getByRole('link', { name: 'link' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
});

describe('TourNav', () => {
  const baseProps = () => ({
    paused: false,
    dwellSec: 8,
    dwellNonce: 1,
    canPrev: true,
    onPrev: vi.fn<() => void>(),
    onNext: vi.fn<() => void>(),
    onTogglePause: vi.fn<() => void>(),
    onExit: vi.fn<() => void>(),
  });

  it('disables prev when canPrev is false', () => {
    render(<TourNav {...baseProps()} canPrev={false} />);
    expect(screen.getByRole('button', { name: 'Previous beat' })).toBeDisabled();
  });

  it('calls the matching handler when each button is clicked', () => {
    const props = baseProps();
    render(<TourNav {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Previous beat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next beat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exit tour' }));

    expect(props.onPrev).toHaveBeenCalledOnce();
    expect(props.onNext).toHaveBeenCalledOnce();
    expect(props.onTogglePause).toHaveBeenCalledOnce();
    expect(props.onExit).toHaveBeenCalledOnce();
  });

  it('flips the pause button aria-label with the paused flag', () => {
    const { rerender } = render(<TourNav {...baseProps()} paused={false} />);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    rerender(<TourNav {...baseProps()} paused={true} />);
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });
});

describe('TourOverlay', () => {
  const baseProps = () => ({
    caption: { title: 'The Virgo Cluster' } as BeatCaption,
    label: 'The Local Universe',
    index: 0,
    total: 3,
    paused: false,
    dwellSec: 8,
    dwellNonce: 0,
    canPrev: false,
    onPrev: vi.fn<() => void>(),
    onNext: vi.fn<() => void>(),
    onTogglePause: vi.fn<() => void>(),
    onExit: vi.fn<() => void>(),
  });

  it('hides the caption during the fly (inDwell false) but always shows the nav', () => {
    // dwellNonce 0 => the dwell has not landed => caption gated off.
    render(<TourOverlay {...baseProps()} dwellNonce={0} />);

    expect(screen.queryByText('The Virgo Cluster')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit tour' })).toBeInTheDocument();
  });

  it('reveals the caption once the dwell lands (nonce bumps)', () => {
    const { rerender } = render(<TourOverlay {...baseProps()} dwellNonce={0} />);
    expect(screen.queryByText('The Virgo Cluster')).not.toBeInTheDocument();

    rerender(<TourOverlay {...baseProps()} dwellNonce={1} />);
    expect(screen.getByText('The Virgo Cluster')).toBeInTheDocument();
  });
});
