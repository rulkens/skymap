// @vitest-environment jsdom

/**
 * CosmicWebDensitySectionContainer — store-backed tests.
 *
 * Checkbox toggle: fireEvent.click — the reliable trigger for controlled
 * checkboxes in jsdom; fireEvent.change does not update e.target.checked for
 * React-controlled inputs. Checkbox order in the rendered DOM: [0] the
 * section's own header master, then one per `COSMIC_WEB_DENSITY_SOURCE_ROWS`
 * entry — mcpm, polyphorm-2mrs, mcpm-workbench.
 */

import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactNode } from 'react';
import CosmicWebDensitySectionContainer from '../../../../src/layers/cosmicWebDensity/ui/CosmicWebDensitySectionContainer';
import { createTestStore } from '../../../support/createTestStore';
import { selectCosmicWebDensityFieldItems } from '../../../../src/layers/cosmicWebDensity/state/cosmicWebDensity/selectors';
import type { AppStore } from '../../../../src/store/types';

function makeWrapper(store: AppStore) {
  return ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
}

describe('CosmicWebDensitySectionContainer', () => {
  it('ticking a cube writes items[id].enabled', () => {
    const { store } = createTestStore();
    expect(selectCosmicWebDensityFieldItems(store.getState())['polyphorm-2mrs'].enabled).toBe(
      false,
    );

    const { container } = render(<CosmicWebDensitySectionContainer />, {
      wrapper: makeWrapper(store),
    });
    const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    // [0] header master; [1] mcpm; [2] polyphorm-2mrs; [3] mcpm-workbench.
    fireEvent.click(checkboxes[2]!);

    expect(selectCosmicWebDensityFieldItems(store.getState())['polyphorm-2mrs'].enabled).toBe(true);
  });

  it('lists every source row, the workbench included', () => {
    const { store } = createTestStore();
    const { getByText } = render(<CosmicWebDensitySectionContainer />, {
      wrapper: makeWrapper(store),
    });

    expect(getByText('MCPM Cosmic Web')).toBeTruthy();
    expect(getByText('Polyphorm (2MRS)')).toBeTruthy();
    expect(getByText('MCPM Workbench (promoted)')).toBeTruthy();
  });
});
