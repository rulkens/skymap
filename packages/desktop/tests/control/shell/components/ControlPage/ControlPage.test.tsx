// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import ControlPage from '../../../../../src/control/shell/components/ControlPage/ControlPage';
import type { InstallSetup } from '../../../../../src/@types/InstallSetup';
import { DEFAULT_INSTALL_SETUP } from '../../../../../src/main/setup/data/defaultInstallSetup';
import { fakeBridge } from './fakeBridge';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(cleanup);

async function renderControls(setup?: InstallSetup) {
  const fake = fakeBridge({ setup });
  render(<ControlPage bridge={fake.bridge} />);
  await screen.findByRole('heading', { name: 'Data' });
  return fake;
}

const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('ControlPage', () => {
  it('a mode change saves the setup and turns the test grid off', async () => {
    const { bridge, push } = await renderControls();
    const grid = screen.getByRole('checkbox', { name: 'Show test grid on the sky' });
    fireEvent.click(grid);
    expect(bridge.showTestGrid).toHaveBeenLastCalledWith(true);
    push('onTestGrid', true);
    expect(grid).toBeChecked();

    await act(async () => fireEvent.click(screen.getByRole('radio', { name: /Dome/ })));

    expect(bridge.saveSetup).toHaveBeenLastCalledWith({ ...DEFAULT_INSTALL_SETUP, mode: 'dome' });
    expect(bridge.showTestGrid).toHaveBeenLastCalledWith(false);
    push('onTestGrid', false);
    expect(grid).not.toBeChecked();
    expect(screen.getByText('Saved')).toBeInTheDocument();
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
    const { push } = await renderControls();
    expect(screen.getByRole('button', { name: 'Update now' })).toBeInTheDocument();
    push('onStatus', { kind: 'offline', hasData: false });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    push('onStatus', { kind: 'offline', hasData: true });
    expect(screen.getByRole('button', { name: 'Update now' })).toBeInTheDocument();
  });

  it('the sync buttons are disabled while syncing', async () => {
    const { push } = await renderControls();
    push('onStatus', { kind: 'syncing' });
    expect(screen.getByRole('button', { name: 'Update now' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Restart sky' })).toBeDisabled();
    push('onStatus', { kind: 'ready' });
    expect(screen.getByRole('button', { name: 'Restart sky' })).toBeEnabled();
  });

  it('a stored screen that is not connected is named, with where the sky went', async () => {
    await renderControls({
      ...DEFAULT_INSTALL_SETUP,
      display: { id: 9, width: 1920, height: 1200 },
    });
    expect(screen.getByText(/saved screen \(1920×1200\) is not connected/)).toBeVisible();
  });

  it('the pairing steps name Allow before the sky runs, and the tablet waits for it', async () => {
    const { push } = await renderControls();
    push('onPairing', { code: 'K7QM3XRT', origin: 'https://10.0.0.2:47823', onSky: false });
    const tablets = screen.getByRole('region', { name: 'Tablets' });
    expect(within(tablets).getByText(/choose Allow/)).toBeVisible();
    expect(within(tablets).getByText('K7QM 3XRT')).toBeVisible();
    expect(within(tablets).getByText('The tablet connects once the sky is running.')).toBeVisible();
    push('onSky', true);
    expect(within(tablets).queryByText(/once the sky is running/)).not.toBeInTheDocument();
  });

  it('Run setup again brings the steps back', async () => {
    await renderControls();
    press('Run setup again');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Where will it show?');
  });

  it('Help opens from its link and from main, and Escape or Back closes it', async () => {
    const { push } = await renderControls();
    press('Help');
    expect(screen.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('heading', { name: 'Data' })).toBeVisible();

    push('onView', 'help');
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
    const { push } = await renderControls();
    push('onView', 'help', 'troubleshooting');
    Element.prototype.scrollIntoView = original;
    expect(scrolled).toEqual(['Troubleshooting']);
  });

  it('About shows the version main reports', async () => {
    const { bridge } = await renderControls();
    await act(async () => press('About'));
    expect(bridge.getAbout).toHaveBeenCalled();
    expect(screen.getByText('1.2.3')).toBeVisible();
    expect(screen.getByText('Not downloaded yet')).toBeVisible();
  });
});
