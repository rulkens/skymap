// @vitest-environment jsdom
//
// TourOverlay presentational tests.
//
// These cover the three presentational pieces in isolation: the caption's
// readout + subtitle lines (TourCaption), the nav cluster's disabled/handler
// wiring + pause aria-label (TourNav), and the overlay's caption-gating
// behaviour (caption hidden during the fly, nav always shown).
//
// Handler mocks are typed `vi.fn<() => void>()` so they satisfy the props'
// `() => void` fields under tsc — a bare `vi.fn()` infers a too-wide type and
// fails the typecheck against the typed props.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import TourCaption from '../../../src/components/TourOverlay/TourCaption';
import TourNav from '../../../src/components/TourOverlay/TourNav';
import TourOverlay from '../../../src/components/TourOverlay/TourOverlay';
import { lineSchedule } from '../../../src/utils/animation/lineSchedule';
import type { BeatCaption } from '../../../src/@types/animation/tour/BeatCaption';
// Vitest replaces CSS-module imports with a stable name proxy, so class
// assertions can use the same `styles.x` tokens the component renders
// instead of hard-coding mangled class names.
import styles from '../../../src/components/TourOverlay/TourOverlay.module.css';

const captionProps = (over: Partial<React.ComponentProps<typeof TourCaption>> = {}) => ({
  caption: { title: 'The Virgo Cluster', lines: ['First line here.', 'Second line follows.'] },
  index: 0,
  total: 3,
  dwellSec: 10,
  dwellNonce: 1,
  paused: false,
  ...over,
});

describe('TourCaption', () => {
  it('labels the beat title with the zero-padded readout', () => {
    render(<TourCaption {...captionProps()} />);
    expect(screen.getByText('The Virgo Cluster · 01 / 03')).toBeInTheDocument();
  });

  it('drops the beat counter without chrome (cinema), keeping the title', () => {
    render(<TourCaption {...captionProps({ hasChrome: false })} />);
    expect(screen.getByText('The Virgo Cluster')).toBeInTheDocument();
    expect(screen.queryByText(/\d{2} \/ \d{2}/)).not.toBeInTheDocument();
  });

  describe('on the frame clock', () => {
    let frame: ((ms: number) => void) | null = null;
    beforeEach(() => {
      vi.stubGlobal('requestAnimationFrame', (cb: (ms: number) => void) => {
        frame = cb;
        return 1;
      });
      vi.stubGlobal('cancelAnimationFrame', () => {
        frame = null;
      });
    });
    afterEach(() => vi.unstubAllGlobals());
    const advance = (ms: number) => act(() => frame!(ms));
    const opacity = (text: string) => screen.getByText(text).style.opacity;

    it('the second line shows after its slice start', () => {
      const props = captionProps();
      const { startSec } = lineSchedule(props.caption.lines, props.dwellSec)[1]!;
      render(<TourCaption {...props} />);
      advance(0);
      advance(1000);
      expect(opacity('Second line follows.')).toBe('0');
      advance(1000 + (startSec + 1) * 1000);
      expect(opacity('Second line follows.')).toBe('1');
      expect(opacity('First line here.')).toBe('0');
    });

    it('pausing freezes the subtitle line', () => {
      const { rerender } = render(<TourCaption {...captionProps()} />);
      advance(0);
      advance(500);
      rerender(<TourCaption {...captionProps({ paused: true })} />);
      // Paused: the clock stops asking for frames, so elapsed cannot advance.
      expect(frame).toBeNull();
      rerender(<TourCaption {...captionProps({ paused: false })} />);
      expect(frame).not.toBeNull();
    });
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
    caption: { title: 'The Virgo Cluster', lines: ['One.'] } as BeatCaption,
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

    expect(screen.queryByText(/The Virgo Cluster/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit tour' })).toBeInTheDocument();
  });

  it('reveals the caption once the dwell lands (nonce bumps)', () => {
    const { rerender } = render(<TourOverlay {...baseProps()} dwellNonce={0} />);
    expect(screen.queryByText(/The Virgo Cluster/)).not.toBeInTheDocument();

    rerender(<TourOverlay {...baseProps()} dwellNonce={1} />);
    expect(screen.getByText(/The Virgo Cluster/)).toBeInTheDocument();
  });

  it('mounts transport + beat counter with chrome (interactive default)', () => {
    render(<TourOverlay {...baseProps()} dwellNonce={1} />);

    expect(screen.getByRole('button', { name: 'Exit tour' })).toBeInTheDocument();
    expect(screen.getByText('The Virgo Cluster · 01 / 03')).toBeInTheDocument();
    // Interactive captions keep their nav clearance — no cinema layout class.
    const captionRoot = screen.getByText(/The Virgo Cluster/).parentElement!;
    expect(captionRoot.classList.contains(styles.captionNoChrome!)).toBe(false);
  });

  it('cinema presentation (hasChrome=false): caption only — no buttons, no counter', () => {
    render(<TourOverlay {...baseProps()} hasChrome={false} dwellNonce={1} />);

    expect(screen.getByText('The Virgo Cluster')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByText(/\d{2} \/ \d{2}/)).not.toBeInTheDocument();
    // Layout: with the nav unmounted, bottom-anchored captions shed their
    // nav clearance via the captionNoChrome modifier. Class presence is the
    // house-appropriate depth — pixel assertions of CSS are brittle in jsdom
    // (styles aren't computed), the class is the contract.
    const captionRoot = screen.getByText(/The Virgo Cluster/).parentElement!;
    expect(captionRoot.classList.contains(styles.captionNoChrome!)).toBe(true);
  });
});
