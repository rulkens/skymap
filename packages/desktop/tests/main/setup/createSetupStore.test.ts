import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstallSetup } from '../../../src/@types/InstallSetup';
import type { SetupEffects } from '../../../src/main/setup/@types/SetupEffects';
import { DEFAULT_INSTALL_SETUP } from '../../../src/main/setup/data/defaultInstallSetup';

const writes = vi.hoisted(() => ({ hold: null as Promise<void> | null }));
vi.mock('../../../src/main/files/utils/writeFileAtomically', async (original) => {
  const real = await original<typeof import('../../../src/main/files/utils/writeFileAtomically')>();
  return {
    writeFileAtomically: async (path: string, data: string) => {
      const hold = writes.hold;
      writes.hold = null;
      await hold;
      await real.writeFileAtomically(path, data);
    },
  };
});
const { createSetupStore } = await import('../../../src/main/setup/createSetupStore');

let userData: string;
const effects = (): SetupEffects => ({
  placeWindows: vi.fn(),
  rearmUpdates: vi.fn(),
  modeChanged: vi.fn(),
  networkChanged: vi.fn(),
  autostartChanged: vi.fn(),
});
const onDisk = (): InstallSetup =>
  JSON.parse(readFileSync(join(userData, 'setup.json'), 'utf8')) as InstallSetup;

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'setup-store-'));
});
afterEach(() => rmSync(userData, { recursive: true, force: true }));

describe('createSetupStore', () => {
  // Audit B I4: two saves in flight could rename in either order, leaving the older one on disk.
  it('two overlapping saves leave the second on disk, even when the first write is slow', async () => {
    const store = createSetupStore(userData, DEFAULT_INSTALL_SETUP, effects());
    let release = (): void => {};
    writes.hold = new Promise((resolve) => (release = resolve));
    const first = store.save({ ...DEFAULT_INSTALL_SETUP, mode: 'dome' });
    const second = store.save({ ...DEFAULT_INSTALL_SETUP, mode: 'kiosk', autostart: true });
    setTimeout(release, 20);
    await Promise.all([first, second]);
    expect(onDisk()).toMatchObject({ mode: 'kiosk', autostart: true });
    expect(store.current()).toMatchObject({ mode: 'kiosk', autostart: true });
  });

  it('applies only what changed against the last stored setup', async () => {
    const e = effects();
    const store = createSetupStore(userData, DEFAULT_INSTALL_SETUP, e);
    await store.save(DEFAULT_INSTALL_SETUP);
    await store.save({ ...DEFAULT_INSTALL_SETUP, mode: 'dome', autostart: true });
    expect(e.modeChanged).toHaveBeenCalledOnce();
    expect(e.autostartChanged).toHaveBeenCalledWith(true);
    expect(e.placeWindows).not.toHaveBeenCalled();
    expect(e.networkChanged).not.toHaveBeenCalled();
  });

  it('a failed write keeps the stored setup and applies nothing', async () => {
    const e = effects();
    const store = createSetupStore(join(userData, 'gone'), DEFAULT_INSTALL_SETUP, e);
    await expect(store.save({ ...DEFAULT_INSTALL_SETUP, mode: 'dome' })).rejects.toThrow();
    expect(store.current().mode).toBe('kiosk');
    expect(e.modeChanged).not.toHaveBeenCalled();
  });
});
