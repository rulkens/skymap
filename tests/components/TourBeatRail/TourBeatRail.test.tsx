// @vitest-environment jsdom
//
// TourBeatRail presentational tests.
//
// The rail's hover reveal is pure CSS (the titles are always in the DOM,
// faded in by :hover), so jsdom can't observe the reveal itself — what it
// CAN observe is the logic: one row per beat, the done/current/upcoming
// classing by index, which rows carry a title, and that nothing is
// clickable. Class assertions go through the same CSS-module import the
// component uses, so they hold under any class-name scoping.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TourBeatRail from '../../../src/components/TourBeatRail/TourBeatRail';
import styles from '../../../src/components/TourBeatRail/TourBeatRail.module.css';

const TITLES: readonly (string | null)[] = ['You are here', null, 'The Virgo Cluster'];

function renderRail(index: number): readonly Element[] {
  render(<TourBeatRail titles={TITLES} index={index} />);
  const root = screen.getByLabelText(`Tour progress: beat ${index + 1} of 3`);
  return Array.from(root.children);
}

describe('TourBeatRail', () => {
  it('renders one dot row per beat under the aria progress label', () => {
    const rows = renderRail(1);
    expect(rows).toHaveLength(3);
  });

  it('classes rows done / current / upcoming by index', () => {
    const [done, current, upcoming] = renderRail(1);
    expect(done?.className).toContain(styles.done);
    expect(done?.className).not.toContain(styles.current);
    expect(current?.className).toContain(styles.current);
    expect(current?.className).not.toContain(styles.done);
    expect(upcoming?.className).not.toContain(styles.done);
    expect(upcoming?.className).not.toContain(styles.current);
  });

  it('titled rows carry their hover label; silent rows carry none', () => {
    const [titled, silent, upcoming] = renderRail(0);
    expect(titled?.textContent).toBe('You are here');
    expect(silent?.textContent).toBe('');
    expect(upcoming?.textContent).toBe('The Virgo Cluster');
  });

  it('is passive: no buttons, no links', () => {
    render(<TourBeatRail titles={TITLES} index={0} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
