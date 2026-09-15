// @vitest-environment jsdom

/**
 * SettingsPanel — composition-order tests (D13).
 *
 * Every container is mocked to a marker `<div>` so the test asserts DOM
 * ORDER only, never a container's own rendering — those live in each
 * container's own test file. `../../../src/compositions/app` is mocked so
 * a test can install a stub Layer with a `ui` section without a real
 * composition existing.
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

const { layersRef } = vi.hoisted(() => ({
  layersRef: { current: [] as ReadonlyArray<{ name: string; ui?: () => React.ReactElement }> },
}));

vi.mock('../../../src/compositions/app', () => ({
  get APP_COMPOSITION() {
    return { layers: layersRef.current, home: null };
  },
}));

vi.mock('../../../src/components/containers/TierChipContainer', () => ({
  default: () => <div data-testid="tier-chip" />,
}));
vi.mock('../../../src/components/containers/GalaxiesSectionContainer', () => ({
  default: () => <div data-testid="galaxies-section" />,
}));
vi.mock('../../../src/components/containers/StarsSectionContainer', () => ({
  default: () => <div data-testid="stars-section" />,
}));
vi.mock('../../../src/components/containers/CosmicWebSectionContainer', () => ({
  default: () => <div data-testid="cosmic-web-section" />,
}));
vi.mock('../../../src/components/containers/FlowSectionContainer', () => ({
  default: () => <div data-testid="flow-section" />,
}));
vi.mock('../../../src/components/containers/StructuresSectionContainer', () => ({
  default: () => <div data-testid="structures-section" />,
}));
vi.mock('../../../src/components/containers/LabelsAndGuidesSectionContainer', () => ({
  default: () => <div data-testid="labels-section" />,
}));
vi.mock('../../../src/components/containers/DisplaySectionContainer', () => ({
  default: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="display-section">{children}</div>
  ),
}));
vi.mock('../../../src/components/containers/EarthSectionContainer', () => ({
  default: () => <div data-testid="earth-section" />,
}));

import { SettingsPanel } from '../../../src/components/SettingsPanel/SettingsPanel';

describe('SettingsPanel — composition order (D13)', () => {
  it('renders a present Layer’s ui section before the core sections', () => {
    layersRef.current = [{ name: 'stub', ui: () => <div data-testid="stub-layer-section" /> }];
    const { getByTestId, container } = render(<SettingsPanel />);

    const layerEl = getByTestId('stub-layer-section');
    const galaxiesEl = getByTestId('galaxies-section');
    // DOCUMENT_POSITION_FOLLOWING: layerEl comes before galaxiesEl.
    expect(layerEl.compareDocumentPosition(galaxiesEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(container.querySelectorAll('[data-testid]').length).toBeGreaterThan(1);

    layersRef.current = [];
  });

  it('renders nothing extra over the empty composition', () => {
    layersRef.current = [];
    const { queryByTestId, getByTestId } = render(<SettingsPanel />);

    expect(queryByTestId('stub-layer-section')).toBeNull();
    // The eight core sections are still present and unchanged.
    expect(getByTestId('galaxies-section')).toBeTruthy();
    expect(getByTestId('stars-section')).toBeTruthy();
    expect(getByTestId('cosmic-web-section')).toBeTruthy();
    expect(getByTestId('flow-section')).toBeTruthy();
    expect(getByTestId('structures-section')).toBeTruthy();
    expect(getByTestId('labels-section')).toBeTruthy();
    expect(getByTestId('display-section')).toBeTruthy();
    expect(getByTestId('earth-section')).toBeTruthy();
  });
});
