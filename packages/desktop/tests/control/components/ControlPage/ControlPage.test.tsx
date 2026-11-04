// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import ControlPage from '../../../../src/control/components/ControlPage/ControlPage';
import type { ControlBridge } from '../../../../src/@types/ControlBridge';
import type { ControlStatus } from '../../../../src/@types/ControlStatus';
import type { InstallSetup } from '../../../../src/@types/InstallSetup';
import { DEFAULT_INSTALL_SETUP } from '../../../../src/data/defaultInstallSetup';

afterEach(cleanup);

function fakeBridge(setup: InstallSetup = DEFAULT_INSTALL_SETUP) {
  let pushStatus: (status: ControlStatus) => void = () => {};
  const bridge = {
    onSync: vi.fn(() => () => {}),
    onStatus: vi.fn((listener: (status: ControlStatus) => void) => {
      pushStatus = listener;
      return () => {};
    }),
    onPairing: vi.fn(() => () => {}),
    updateNow: vi.fn(),
    restartSky: vi.fn(),
    getSetup: vi.fn(async () => setup),
    saveSetup: vi.fn(async () => {}),
    listDisplays: vi.fn(async () => []),
    listNetworks: vi.fn(async () => []),
    showTestGrid: vi.fn(),
    rotateCode: vi.fn(),
    quit: vi.fn(),
  } satisfies ControlBridge;
  return { bridge, pushStatus: (status: ControlStatus) => act(() => pushStatus(status)) };
}

async function renderLoaded(setup?: InstallSetup) {
  const fake = fakeBridge(setup);
  render(<ControlPage bridge={fake.bridge} />);
  await screen.findByRole('radio', { name: 'Kiosk' });
  return fake;
}

describe('ControlPage', () => {
  it('a mode change saves the setup and turns the test grid off', async () => {
    const { bridge } = await renderLoaded();
    const grid = screen.getByRole('checkbox', { name: 'Show test grid on the sky' });
    fireEvent.click(grid);
    expect(bridge.showTestGrid).toHaveBeenLastCalledWith(true);

    await act(async () => fireEvent.click(screen.getByRole('radio', { name: 'Dome' })));

    expect(bridge.saveSetup).toHaveBeenLastCalledWith({ ...DEFAULT_INSTALL_SETUP, mode: 'dome' });
    expect(bridge.showTestGrid).toHaveBeenLastCalledWith(false);
    expect(grid).not.toBeChecked();
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('the daily time is editable only while daily updates are picked', async () => {
    const { bridge } = await renderLoaded();
    const time = screen.getByLabelText('Daily update time');
    expect(time).toBeDisabled();

    await act(async () => fireEvent.click(screen.getByRole('radio', { name: 'Every day at' })));

    expect(time).toBeEnabled();
    expect(bridge.saveSetup).toHaveBeenLastCalledWith({
      ...DEFAULT_INSTALL_SETUP,
      dataUpdates: { kind: 'daily', at: '03:00' },
    });
  });

  it('Update now reads Retry when the sky lacks data it needs', async () => {
    const { pushStatus } = await renderLoaded();
    expect(screen.getByRole('button', { name: 'Update now' })).toBeInTheDocument();
    pushStatus({ kind: 'offline', hasData: false });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    pushStatus({ kind: 'offline', hasData: true });
    expect(screen.getByRole('button', { name: 'Update now' })).toBeInTheDocument();
  });

  it('the sync buttons are disabled while syncing', async () => {
    const { pushStatus } = await renderLoaded();
    pushStatus({ kind: 'syncing' });
    expect(screen.getByRole('button', { name: 'Update now' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Restart sky' })).toBeDisabled();
    pushStatus({ kind: 'ready' });
    expect(screen.getByRole('button', { name: 'Restart sky' })).toBeEnabled();
  });

  it('the pairing panel shows the firewall Allow note before any code exists', async () => {
    await renderLoaded();
    const pairing = screen.getByRole('region', { name: 'Remote pairing' });
    expect(within(pairing).getByText(/Choose Allow/)).toBeVisible();
    expect(within(pairing).getByText('The code appears once the sky has started.')).toBeVisible();
  });

  it('Rotate code asks the main process for a new code', async () => {
    const { bridge } = await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Rotate code' }));
    expect(bridge.rotateCode).toHaveBeenCalledOnce();
  });
});
