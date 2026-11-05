import { act } from '@testing-library/react';
import { vi } from 'vitest';
import type { ControlBridge } from '../../../../../src/@types/ControlBridge';
import type { ControlState } from '../../../../../src/@types/ControlState';
import type { DisplayInfo } from '../../../../../src/@types/DisplayInfo';
import type { HelpSection } from '../../../../../src/@types/HelpSection';
import { DEFAULT_INSTALL_SETUP } from '../../../../../src/main/setup/data/defaultInstallSetup';

export const TWO_DISPLAYS: DisplayInfo[] = [
  { id: 1, number: 1, label: 'Built-in', width: 2880, height: 1800, primary: true },
  { id: 7, number: 2, label: 'Projector', width: 4096, height: 4096, primary: false },
];

const BASE_STATE: ControlState = {
  status: { kind: 'idle' },
  progress: null,
  hasData: true,
  skyRunning: false,
  skyLoading: false,
  testGrid: false,
  room: { code: 'K7QM3XRT', origin: 'https://10.0.0.2:47823', onSky: false },
  displays: TWO_DISPLAYS,
  placement: { sky: TWO_DISPLAYS[0]!, control: TWO_DISPLAYS[1]!, storedMissing: false },
  networks: [{ name: 'en0', address: '10.0.0.2' }],
  setup: DEFAULT_INSTALL_SETUP,
  firstRun: false,
  about: { version: '1.2.3', dataDate: null },
  lastAttempt: null,
};

/** A main process stand-in: the page's calls are spies, `set` pushes a changed state, `help` asks for Help. */
export function fakeBridge(over: Partial<ControlState> = {}) {
  let state: ControlState = { ...BASE_STATE, ...over };
  let onState: ((state: ControlState) => void) | null = null;
  let onHelp: ((section?: HelpSection) => void) | null = null;
  const push = (patch: Partial<ControlState>): void => {
    state = { ...state, ...patch };
    onState?.(state);
  };
  const bridge = {
    getState: vi.fn(async () => state),
    onState: vi.fn((listener: (state: ControlState) => void) => {
      onState = listener;
      return () => {};
    }),
    onHelp: vi.fn((listener: (section?: HelpSection) => void) => {
      onHelp = listener;
      return () => {};
    }),
    // Main stores the setup, then pushes the state that carries it.
    saveSetup: vi.fn(async (setup: ControlState['setup']) => push({ setup })),
    updateNow: vi.fn(),
    pauseSync: vi.fn(),
    restartSky: vi.fn(),
    showTestGrid: vi.fn(),
    rotateCode: vi.fn(async () => {}),
    hide: vi.fn(),
    quit: vi.fn(),
  } satisfies ControlBridge;
  const set = (patch: Partial<ControlState>): void => act(() => push(patch));
  const help = (section?: HelpSection): void => act(() => onHelp?.(section));
  return { bridge, set, help };
}
