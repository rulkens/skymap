import { act } from '@testing-library/react';
import { vi } from 'vitest';
import type { ControlBridge } from '../../../../src/@types/ControlBridge';
import type { DisplayInfo } from '../../../../src/@types/DisplayInfo';
import type { InstallSetup } from '../../../../src/@types/InstallSetup';
import type { LanInterface } from '../../../../src/@types/LanInterface';
import { DEFAULT_INSTALL_SETUP } from '../../../../src/data/defaultInstallSetup';

export const TWO_DISPLAYS: DisplayInfo[] = [
  { id: 1, label: 'Built-in', width: 2880, height: 1800, primary: true },
  { id: 7, label: 'Projector', width: 4096, height: 4096, primary: false },
];

type Pushed = 'onSync' | 'onStatus' | 'onSky' | 'onDisplays' | 'onView' | 'onPairing';
type Value<K extends Pushed> = Parameters<Parameters<ControlBridge[K]>[0]>[0];

/** A main process stand-in: the page's calls are spies, and `push` plays main's events. */
export function fakeBridge(
  opts: {
    firstRun?: boolean;
    setup?: InstallSetup;
    displays?: DisplayInfo[];
    networks?: LanInterface[];
  } = {},
) {
  const listeners: Partial<Record<Pushed, (value: unknown) => void>> = {};
  const on =
    <K extends Pushed>(name: K) =>
    (listener: (value: Value<K>) => void) => {
      listeners[name] = listener as (value: unknown) => void;
      return () => {};
    };
  const bridge = {
    onSync: vi.fn(on('onSync')),
    onStatus: vi.fn(on('onStatus')),
    onSky: vi.fn(on('onSky')),
    onDisplays: vi.fn(on('onDisplays')),
    onView: vi.fn(on('onView')),
    onPairing: vi.fn(on('onPairing')),
    updateNow: vi.fn(),
    restartSky: vi.fn(),
    isFirstRun: vi.fn(async () => opts.firstRun ?? false),
    getSetup: vi.fn(async () => opts.setup ?? DEFAULT_INSTALL_SETUP),
    saveSetup: vi.fn(async () => {}),
    listDisplays: vi.fn(async () => opts.displays ?? TWO_DISPLAYS),
    listNetworks: vi.fn(async () => opts.networks ?? [{ name: 'en0', address: '10.0.0.2' }]),
    getAbout: vi.fn(async () => ({ version: '1.2.3', dataDate: null })),
    showTestGrid: vi.fn(),
    rotateCode: vi.fn(),
    hide: vi.fn(),
    quit: vi.fn(),
  } satisfies ControlBridge;
  const push = <K extends Pushed>(name: K, value: Value<K>): void =>
    act(() => listeners[name]?.(value));
  return { bridge, push };
}
