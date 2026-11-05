// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import ControlPage from '../../../../../src/control/shell/components/ControlPage/ControlPage';
import type { InstallSetup } from '../../../../../src/@types/InstallSetup';
import { DEFAULT_INSTALL_SETUP } from '../../../../../src/main/setup/data/defaultInstallSetup';
import { TWO_DISPLAYS, fakeBridge } from './fakeBridge';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(cleanup);

async function renderControls(setup: InstallSetup = DEFAULT_INSTALL_SETUP) {
  const fake = fakeBridge({ setup });
  render(<ControlPage bridge={fake.bridge} />);
  await screen.findByRole('heading', { name: 'Data' });
  return fake;
}

const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('ControlPage', () => {
  // The page used to depend on main replaying its state on did-finish-load, after the listeners attached.
  it('keeps a state main pushed before its first read answered', async () => {
    const fake = fakeBridge();
    const stale = await fake.bridge.getState();
    let answer: (state: typeof stale) => void = () => {};
    fake.bridge.getState.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    render(<ControlPage bridge={fake.bridge} />);
    fake.set({ status: { kind: 'syncing' } });
    await act(async () => answer(stale));
    expect(screen.getByRole('button', { name: 'Update now' })).toBeDisabled();
  });

  it('a mode change saves the setup; the grid follows main', async () => {
    const { bridge, set } = await renderControls();
    const grid = screen.getByRole('checkbox', { name: 'Show test grid on the sky' });
    fireEvent.click(grid);
    expect(bridge.showTestGrid).toHaveBeenLastCalledWith(true);
    set({ testGrid: true });
    expect(grid).toBeChecked();

    await act(async () => fireEvent.click(screen.getByRole('radio', { name: /Dome/ })));

    expect(bridge.saveSetup).toHaveBeenLastCalledWith({ ...DEFAULT_INSTALL_SETUP, mode: 'dome' });
    expect(screen.getByText('Saved')).toBeInTheDocument();
    set({ testGrid: false });
    expect(grid).not.toBeChecked();
  });

  it('the daily time is editable only while daily updates are picked', async () => {
    const { bridge } = await renderControls();
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
    const { set } = await renderControls();
    expect(screen.getByRole('button', { name: 'Update now' })).toBeInTheDocument();
    set({ status: { kind: 'offline' }, hasData: false });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    set({ hasData: true });
    expect(screen.getByRole('button', { name: 'Update now' })).toBeInTheDocument();
  });

  // Regression: a retry that failed again in milliseconds brought back the same words, so Retry looked dead.
  it('a pressed Retry reads Trying again for at least a second, and until main answers', async () => {
    const { bridge, set } = await renderControls();
    set({ status: { kind: 'offline' }, hasData: false, lastAttempt: 1000 });
    vi.useFakeTimers();
    try {
      press('Retry');
      expect(bridge.updateNow).toHaveBeenCalledOnce();
      expect(screen.getByRole('button', { name: 'Trying again…' })).toBeDisabled();

      act(() => void vi.advanceTimersByTime(5000));
      expect(screen.getByRole('button', { name: 'Trying again…' })).toBeDisabled();

      set({ lastAttempt: 2000 });
      expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a Retry answered at once still holds for a second', async () => {
    const { set } = await renderControls();
    set({ status: { kind: 'offline' }, hasData: false, lastAttempt: 1000 });
    vi.useFakeTimers();
    try {
      press('Retry');
      set({ lastAttempt: 2000 });
      act(() => void vi.advanceTimersByTime(900));
      expect(screen.getByRole('button', { name: 'Trying again…' })).toBeDisabled();
      act(() => void vi.advanceTimersByTime(200));
      expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('the sync buttons are disabled while syncing', async () => {
    const { set } = await renderControls();
    set({ status: { kind: 'syncing' } });
    expect(screen.getByRole('button', { name: 'Update now' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Restart sky' })).toBeDisabled();
    set({ status: { kind: 'ready' } });
    expect(screen.getByRole('button', { name: 'Restart sky' })).toBeEnabled();
  });

  it('a stored screen that is not connected is named, with where the sky went', async () => {
    const { set } = await renderControls({
      ...DEFAULT_INSTALL_SETUP,
      display: { id: 9, width: 1920, height: 1200 },
    });
    expect(screen.queryByText(/is not connected/)).not.toBeInTheDocument();
    set({ placement: { sky: TWO_DISPLAYS[0]!, control: TWO_DISPLAYS[1]!, storedMissing: true } });
    expect(
      screen.getByText(/saved screen \(1920×1200\) is not connected.*display 1/),
    ).toBeVisible();
  });

  it('Restart sky is off, with the reason, until the data is on this computer', async () => {
    const { set } = await renderControls();
    set({ hasData: false });
    expect(screen.getByRole('button', { name: 'Restart sky' })).toBeDisabled();
    expect(screen.getByText(/needs the data/)).toBeVisible();
    set({ hasData: true });
    expect(screen.getByRole('button', { name: 'Restart sky' })).toBeEnabled();
  });

  it('the pairing steps name Allow before the sky runs, and the tablet waits for it', async () => {
    const { set } = await renderControls();
    const tablets = screen.getByRole('region', { name: 'Tablets' });
    expect(within(tablets).getByText(/choose Allow/)).toBeVisible();
    expect(within(tablets).getByText('K7QM 3XRT')).toBeVisible();
    expect(within(tablets).getByText('The tablet connects once the sky is running.')).toBeVisible();
    set({ skyRunning: true });
    expect(within(tablets).queryByText(/once the sky is running/)).not.toBeInTheDocument();
  });

  it('Run setup again brings the steps back', async () => {
    await renderControls();
    press('Run setup again');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Pick your setup');
  });

  it('Help opens from its link and from main, and Escape or Back closes it', async () => {
    const { view } = await renderControls();
    press('Help');
    expect(screen.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('heading', { name: 'Data' })).toBeVisible();

    view('help');
    expect(screen.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible();
    press('Back to the controls');
    expect(screen.getByRole('heading', { name: 'Data' })).toBeVisible();
  });

  it('a menu item opens Help at the section it names', async () => {
    // jsdom has no scrollIntoView; this one records which section was asked for.
    const scrolled: string[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.querySelector('h2')?.textContent ?? '');
    };
    const { view } = await renderControls();
    view('help', 'troubleshooting');
    Element.prototype.scrollIntoView = original;
    expect(scrolled).toEqual(['Troubleshooting']);
  });

  it('About shows the version main reports', async () => {
    await renderControls();
    press('About');
    expect(screen.getByText('1.2.3')).toBeVisible();
    expect(screen.getByText('Not downloaded yet')).toBeVisible();
  });
  // Audit B I8: a refused save left "Saving" up for good and the page out of step with main.
  it('a save main refuses says so and shows the stored choice again', async () => {
    const { bridge } = await renderControls();
    bridge.saveSetup.mockRejectedValueOnce(new Error('ENOSPC'));
    await act(async () => fireEvent.click(screen.getByRole('radio', { name: /Dome/ })));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
    expect(screen.getByRole('radio', { name: /Kiosk/ })).toBeChecked();
  });

  // Audit B I9: clearing the time saved "every launch" and disabled the field under the cursor.
  it('clearing the daily time is a draft: nothing saves and the field stays open', async () => {
    const { bridge } = await renderControls({
      ...DEFAULT_INSTALL_SETUP,
      dataUpdates: { kind: 'daily', at: '05:30' },
    });
    const time = screen.getByLabelText('Daily update time');
    await act(async () => fireEvent.change(time, { target: { value: '' } }));
    expect(bridge.saveSetup).not.toHaveBeenCalled();
    expect(time).toBeEnabled();
    expect(screen.getByRole('radio', { name: 'Every day at' })).toBeChecked();
    await act(async () => fireEvent.change(time, { target: { value: '06:15' } }));
    expect(bridge.saveSetup).toHaveBeenLastCalledWith({
      ...DEFAULT_INSTALL_SETUP,
      dataUpdates: { kind: 'daily', at: '06:15' },
    });
  });

  it('Rotate code takes a second press that names the cost, and Escape cancels it', async () => {
    const { bridge } = await renderControls();
    press('Rotate code');
    expect(bridge.rotateCode).not.toHaveBeenCalled();
    const confirm = screen.getByRole('button', { name: 'Disconnect tablets and rotate' });
    fireEvent.keyDown(confirm, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Rotate code' })).toBeVisible();

    let done = (): void => {};
    bridge.rotateCode.mockImplementationOnce(() => new Promise<void>((r) => (done = r)));
    press('Rotate code');
    press('Disconnect tablets and rotate');
    expect(bridge.rotateCode).toHaveBeenCalledOnce();
    expect(screen.getByText('Rotating the code')).toBeVisible();
    press('Disconnect tablets and rotate');
    expect(bridge.rotateCode).toHaveBeenCalledOnce();
    await act(async () => done());
    expect(screen.getByRole('button', { name: 'Rotate code' })).toBeVisible();
  });

  it('Help takes focus on open and gives it back to its link on close', async () => {
    await renderControls();
    press('Help');
    expect(screen.getByRole('heading', { level: 1, name: 'Help' })).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Help' })).toHaveFocus();
  });

  it('Restart sky waits while a sky loads, and says so', async () => {
    const { set } = await renderControls();
    set({ skyLoading: true });
    expect(screen.getByRole('button', { name: 'Restart sky' })).toBeDisabled();
    expect(screen.getByText('Loading the sky')).toBeVisible();
  });
});
