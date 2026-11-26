// @vitest-environment jsdom
// A ResizeObserver on the CSS box stays silent when the window moves to a display
// with another pixel ratio, so a paused run would keep a blurry line without this.
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HistogramPlot from '../../../../../../tools/mcpm-workbench/src/ui/sim/HistogramPlot/HistogramPlot';
import { drawHistoryLine } from '../../../../../../tools/mcpm-workbench/src/ui/sim/HistogramPlot/utils/drawHistoryLine';
import { defaultHistogramSlice } from '../../../../../../tools/mcpm-workbench/src/state/histogram/histogramSlice';

vi.mock(
  '../../../../../../tools/mcpm-workbench/src/ui/sim/HistogramPlot/utils/drawHistoryLine',
  () => ({ drawHistoryLine: vi.fn() }),
);

describe('HistogramPlot', () => {
  it('redraws the history line when the device pixel ratio changes', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      },
    );
    const query = new EventTarget();
    vi.stubGlobal('matchMedia', () => query);

    render(<HistogramPlot histogram={defaultHistogramSlice} />);
    query.dispatchEvent(new Event('change'));

    expect(drawHistoryLine).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
