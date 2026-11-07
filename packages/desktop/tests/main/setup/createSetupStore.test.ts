import { describe, expect, it, vi } from 'vitest';
import type { SetupEffects } from '../../../src/main/setup/@types/SetupEffects';
import { createSetupStore } from '../../../src/main/setup/createSetupStore';
import { DEFAULT_INSTALL_SETUP } from '../../../src/main/setup/data/defaultInstallSetup';
import { memorySettings } from '../settings/memorySettings';

const effects = (): SetupEffects => ({
  placeWindows: vi.fn(),
  rearmUpdates: vi.fn(),
  modeChanged: vi.fn(),
  networkChanged: vi.fn(),
  autostartChanged: vi.fn(),
});

describe('createSetupStore', () => {
  it('stores each save and applies only what changed against the last stored setup', async () => {
    const e = effects();
    const { settings, values } = memorySettings();
    const store = createSetupStore(settings, DEFAULT_INSTALL_SETUP, e);
    await store.save(DEFAULT_INSTALL_SETUP);
    await store.save({ ...DEFAULT_INSTALL_SETUP, mode: 'dome', autostart: true });
    expect(values.get('setup')).toMatchObject({ mode: 'dome', autostart: true });
    expect(e.modeChanged).toHaveBeenCalledOnce();
    expect(e.autostartChanged).toHaveBeenCalledWith(true);
    expect(e.placeWindows).not.toHaveBeenCalled();
    expect(e.networkChanged).not.toHaveBeenCalled();
  });

  // A full disk: the page must not show a mode the next launch will not have.
  it('a failed write keeps the stored setup and applies nothing', async () => {
    const e = effects();
    const { settings } = memorySettings();
    settings.set = () => {
      throw new Error('ENOSPC');
    };
    const store = createSetupStore(settings, DEFAULT_INSTALL_SETUP, e);
    await expect(store.save({ ...DEFAULT_INSTALL_SETUP, mode: 'dome' })).rejects.toThrow('ENOSPC');
    expect(store.current().mode).toBe('kiosk');
    expect(e.modeChanged).not.toHaveBeenCalled();
  });
});
