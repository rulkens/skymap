import { describe, expect, it } from 'vitest';
import { createBenchStore } from '../../../../../tools/albedo-bench/ui/store/createBenchStore';
import { setView } from '../../../../../tools/albedo-bench/ui/store/navigationSlice';
import {
  adjustedRendered,
  originalRendered,
} from '../../../../../tools/albedo-bench/ui/store/renderSlice';
import { selectBox } from '../../../../../tools/albedo-bench/ui/store/selectBox';
import { selectRenderLag } from '../../../../../tools/albedo-bench/ui/store/selectRenderLag';

describe('selectRenderLag', () => {
  it('stays pending until BOTH images match the view, anchored on the one behind', () => {
    const store = createBenchStore();
    const oldBox = selectBox(store.getState());
    store.dispatch(originalRendered({ url: 'blob:o1', box: oldBox }));
    store.dispatch(adjustedRendered({ url: 'blob:a1', box: oldBox }));
    expect(selectRenderLag(store.getState())).toEqual({ pending: false, renderedBox: oldBox });

    store.dispatch(setView({ lon: 0, lat: 0, spanDeg: 4 }));
    const newBox = selectBox(store.getState());
    store.dispatch(originalRendered({ url: 'blob:o2', box: newBox }));
    expect(selectRenderLag(store.getState())).toEqual({ pending: true, renderedBox: oldBox });

    store.dispatch(adjustedRendered({ url: 'blob:a2', box: newBox }));
    expect(selectRenderLag(store.getState())).toEqual({ pending: false, renderedBox: newBox });
  });
});
