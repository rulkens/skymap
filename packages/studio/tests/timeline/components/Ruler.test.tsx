// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';

import { dollyTo, seq } from '../../../../../src/services/engine/animation/effectHelpers';
import Ruler from '../../../src/timeline/components/Ruler/Ruler';
import { selectPlayheadSec, selectTransport } from '../../../src/session/state/selectors';
import { played } from '../../../src/session/state/studioSlice';
import { selectTimeline } from '../../../src/timeline/state/selectTimeline';
import { openStudioStore } from '../../helpers/openStudioStore';

afterEach(cleanup);

// Steps at 0, 4 s; End at 8 s. A 960 px ruler over 0-10 s is 10.4 ms per px, so 6 px is 0.0625 s.
const WINDOW = { startSec: 0, endSec: 10 };
const RECT = { left: 0, top: 0, width: 960, height: 24, right: 960, bottom: 24, x: 0, y: 0 };

function mount(window = WINDOW) {
  const store = openStudioStore({ timeline: [seq([dollyTo(300, 4), dollyTo(950, 4)])] });
  render(
    <Provider store={store}>
      <Ruler timeline={selectTimeline(store.getState())!} window={window} />
    </Provider>,
  );
  const ruler = screen.getByLabelText('Timeline ruler');
  ruler.getBoundingClientRect = () => ({ ...RECT, toJSON: () => RECT });
  return { store, ruler };
}

/** Pointer x for a time, 96 px per second. */
const x = (sec: number) => sec * 96;

describe('Ruler', () => {
  it('clicking the ruler near a step edge seeks to the edge', () => {
    const { store, ruler } = mount();
    fireEvent.pointerDown(ruler, { clientX: x(3.97) });
    expect(selectPlayheadSec(store.getState())).toBe(4);
  });

  it('ticks from a minute on read m:ss', () => {
    mount({ startSec: 0, endSec: 300 });
    expect(screen.getByText('1:00')).toBeInTheDocument();
    expect(screen.getByText('2:30')).toBeInTheDocument();
  });

  it('zoomed short of End, there is no after-end caption and the last labels stay', () => {
    // End is at 8 s, off the right of a 0-5 s window; the 800 px fallback track puts 4.5 s at 720 px.
    mount({ startSec: 0, endSec: 5 });
    expect(screen.queryByText('after end')).toBeNull();
    expect(screen.getByText('4.5')).toBeInTheDocument();
  });

  it('holding Alt seeks to the exact pointer time', () => {
    const { store, ruler } = mount();
    fireEvent.pointerDown(ruler, { clientX: x(3.97), altKey: true });
    expect(selectPlayheadSec(store.getState())).toBeCloseTo(3.97, 5);
  });

  it('a drag that starts while playing pauses and resumes from the release point', () => {
    const { store, ruler } = mount();
    const loop = { startSec: 0, endSec: 8 };
    store.dispatch(played({ fromSec: 1, loop }));

    fireEvent.pointerDown(ruler, { clientX: x(2), altKey: true });
    expect(selectTransport(store.getState()).kind).toBe('paused');
    fireEvent.pointerMove(ruler, { clientX: x(3), altKey: true });
    expect(selectTransport(store.getState()).kind).toBe('paused');
    fireEvent.pointerUp(ruler);
    expect(selectTransport(store.getState())).toEqual({ kind: 'running', fromSec: 3, loop });
  });

  it('a release outside the loop resumes from the loop start', () => {
    const { store, ruler } = mount();
    const loop = { startSec: 0, endSec: 4 };
    store.dispatch(played({ fromSec: 1, loop }));

    fireEvent.pointerDown(ruler, { clientX: x(6), altKey: true });
    fireEvent.pointerUp(ruler);
    expect(selectTransport(store.getState())).toEqual({ kind: 'running', fromSec: 0, loop });
  });
});
