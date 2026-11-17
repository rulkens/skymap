// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import ControlPage from '../../../../../src/control/shell/components/ControlPage/ControlPage';
import { DEFAULT_INSTALL_SETUP } from '../../../../../src/main/setup/data/defaultInstallSetup';
import { TWO_DISPLAYS, fakeBridge } from '../../../shell/components/ControlPage/fakeBridge';

// jsdom has no canvas; the QR draws nothing rather than logging "not implemented".
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(cleanup);

async function firstRun(over: Parameters<typeof fakeBridge>[0] = {}) {
  const fake = fakeBridge({ firstRun: true, hasData: false, ...over });
  render(<ControlPage bridge={fake.bridge} />);
  await screen.findByRole('button', { name: 'Start setup' });
  return fake;
}

const title = () => screen.getByRole('heading', { level: 1 });
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const railStep = (name: string) =>
  within(screen.getByRole('navigation', { name: 'Setup steps' })).getByRole('button', {
    name: new RegExp(name),
  });

describe('SetupFlow', () => {
  it('opens on Welcome and walks the steps in order, Back retracing them', async () => {
    await firstRun();
    expect(title()).toHaveAccessibleName('Skymap');
    press('Start setup');
    expect(title()).toHaveTextContent('Pick your setup');
    press('Next');
    expect(title()).toHaveTextContent('Which screen?');
    press('Next');
    expect(title()).toHaveTextContent('Connect a tablet');
    press('Next');
    expect(title()).toHaveTextContent('Every day');
    press('Back');
    press('Back');
    expect(title()).toHaveTextContent('Which screen?');
  });

  it('Enter takes the primary action from the step, not from a button', async () => {
    await firstRun();
    fireEvent.keyDown(title(), { key: 'Enter' });
    expect(title()).toHaveTextContent('Pick your setup');
  });

  it('a choice saves the moment it is made, before Next', async () => {
    const { bridge } = await firstRun();
    press('Start setup');
    await act(async () => fireEvent.click(screen.getByRole('radio', { name: /Dome/ })));
    expect(bridge.saveSetup).toHaveBeenLastCalledWith({ ...DEFAULT_INSTALL_SETUP, mode: 'dome' });
    expect(title()).toHaveTextContent('Pick your setup');
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  // Main ends the first run at the first save, so a page reloaded after a crash opens on the controls.
  it('stays in setup when main ends the first run mid-way', async () => {
    const { set } = await firstRun();
    press('Start setup');
    set({ firstRun: false });
    expect(title()).toHaveTextContent('Pick your setup');
  });

  it('the screen step shows the test grid while open and moves the sky on a pick', async () => {
    const { bridge } = await firstRun();
    fireEvent.click(railStep('Which screen'));
    expect(bridge.showTestGrid).toHaveBeenLastCalledWith(true);
    await act(async () => fireEvent.click(screen.getByRole('radio', { name: /Display 2/ })));
    expect(bridge.saveSetup).toHaveBeenLastCalledWith({
      ...DEFAULT_INSTALL_SETUP,
      display: { id: 7, width: 4096, height: 4096 },
    });
    expect(bridge.showTestGrid).toHaveBeenLastCalledWith(true);
    press('Next');
    expect(bridge.showTestGrid).toHaveBeenLastCalledWith(false);
  });

  it('one screen passes over "Which screen" both ways and says why', async () => {
    await firstRun({ displays: [TWO_DISPLAYS[0]!] });
    press('Start setup');
    press('Next');
    expect(title()).toHaveTextContent('Connect a tablet');
    expect(railStep('Which screen')).toBeDisabled();
    expect(railStep('Which screen')).toHaveTextContent('One screen, so the sky uses it');
    press('Back');
    expect(title()).toHaveTextContent('Pick your setup');
  });

  it('Finish waits on the download in words, then says the sky is ready', async () => {
    const { bridge, set } = await firstRun();
    set({ status: { kind: 'syncing' }, progress: { doneBytes: 2e9, totalBytes: 6e9 } });
    fireEvent.click(railStep('Every day'));
    press('Finish');
    expect(title()).toHaveTextContent('Waiting for the download');
    expect(screen.getByText(/when the download finishes/)).toBeVisible();
    expect(screen.getByText('2.0 GB of 6.0 GB · 4.0 GB left')).toBeVisible();

    set({
      status: { kind: 'complete' },
      progress: { doneBytes: 6e9, totalBytes: 6e9 },
      hasData: true,
      skyRunning: true,
    });
    expect(title()).toHaveTextContent('The sky is ready');
    press('Close setup');
    expect(screen.getByRole('heading', { name: 'Data' })).toBeVisible();
    expect(bridge.hide).not.toHaveBeenCalled();
  });

  it('on one screen the last button hides this window to show the sky', async () => {
    const { bridge, set } = await firstRun({ displays: [TWO_DISPLAYS[0]!] });
    set({ skyRunning: true });
    fireEvent.click(railStep('Every day'));
    press('Finish');
    press('Show the sky');
    expect(bridge.hide).toHaveBeenCalledOnce();
  });

  it('the strip pauses a running download and resumes a paused one', async () => {
    const { bridge, set } = await firstRun();
    set({ status: { kind: 'syncing' }, progress: { doneBytes: 2e9, totalBytes: 6e9 } });
    press('Pause download');
    expect(bridge.pauseSync).toHaveBeenCalledOnce();
    set({ status: { kind: 'paused' } });
    expect(screen.getByText('Download paused')).toBeVisible();
    expect(screen.getByText('2.0 GB of 6.0 GB · 4.0 GB left')).toBeVisible();
    press('Resume download');
    expect(bridge.updateNow).toHaveBeenCalledOnce();
  });

  it('a failed download shows the file and the error beside Retry', async () => {
    const { set } = await firstRun();
    set({
      status: {
        kind: 'failed',
        failure: { reason: 'stale', key: 'data/images/earth-tiles/x.webp', detail: 'HTTP 404' },
      },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('being updated');
    expect(screen.getByText('data/images/earth-tiles/x.webp: HTTP 404')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });

  it('offline, the strip says why and Retry asks main to download again', async () => {
    const { bridge, set } = await firstRun();
    set({ status: { kind: 'offline' } });
    expect(screen.getByRole('alert')).toHaveTextContent('needs the internet once');
    press('Retry');
    expect(bridge.updateNow).toHaveBeenCalledOnce();
    set({ status: { kind: 'syncing' } });
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });
});
