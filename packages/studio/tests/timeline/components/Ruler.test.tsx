// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';

import { dollyTo, seq } from '../../../../../src/services/engine/animation/effectHelpers';
import Ruler from '../../../src/timeline/components/Ruler/Ruler';
import { selectPlayheadSec } from '../../../src/session/state/selectors';
import { selectTimeline } from '../../../src/timeline/state/selectTimeline';
import { openStudioStore } from '../../helpers/openStudioStore';

afterEach(cleanup);

// Steps at 0, 4 s; End at 8 s. A 960 px ruler over 0-10 s is 10.4 ms per px, so 6 px is 0.0625 s.
const WINDOW = { startSec: 0, endSec: 10 };
const RECT = { left: 0, top: 0, width: 960, height: 24, right: 960, bottom: 24, x: 0, y: 0 };

function mount() {
  const store = openStudioStore({ timeline: [seq([dollyTo(300, 4), dollyTo(950, 4)])] });
  render(
    <Provider store={store}>
      <Ruler timeline={selectTimeline(store.getState())!} window={WINDOW} playheadSec={0} />
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

  it('holding Alt seeks to the exact pointer time', () => {
    const { store, ruler } = mount();
    fireEvent.pointerDown(ruler, { clientX: x(3.97), altKey: true });
    expect(selectPlayheadSec(store.getState())).toBeCloseTo(3.97, 5);
  });
});
