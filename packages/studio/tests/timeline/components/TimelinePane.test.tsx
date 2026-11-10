// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';

import { all, dollyTo, seq } from '../../../../../src/services/engine/animation/effectHelpers';
import TimelinePane from '../../../src/timeline/components/TimelinePane/TimelinePane';
import { selectCollapsed, selectSelection } from '../../../src/session/state/selectors';
import { openStudioStore } from '../../helpers/openStudioStore';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';

afterEach(cleanup);

const mount = (draft: ClipData) => {
  const store = openStudioStore(draft);
  render(
    <Provider store={store}>
      <TimelinePane />
    </Provider>,
  );
  return store;
};

describe('TimelinePane', () => {
  it('clicking a row selects it; clicking its twisty toggles collapse without selecting', () => {
    const store = mount({ timeline: [seq([dollyTo(300, 4), dollyTo(950, 4)])] });

    fireEvent.click(screen.getAllByRole('treeitem')[2]!);
    expect(selectSelection(store.getState())).toEqual({ kind: 'effect', path: [0, 0] });

    fireEvent.click(screen.getByRole('button', { name: 'Fold In order' }));
    expect(selectCollapsed(store.getState())).toEqual(['e:0']);
    expect(selectSelection(store.getState())).toEqual({ kind: 'effect', path: [0, 0] });
  });

  it('an invalid row is marked invalid and shows the warning in its duration', () => {
    mount({ timeline: [all([dollyTo(300, 4), dollyTo(500, 4)])] });

    const invalid = screen.getAllByRole('treeitem').filter((el) => el.ariaInvalid === 'true');
    expect(invalid.length).toBeGreaterThan(0);
    expect(invalid[0]!.textContent).toContain('⚠');
  });
});
