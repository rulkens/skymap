import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import type { MenuActions } from '../../../src/main/menu/@types/MenuActions';
import { buildMenuTemplate } from '../../../src/main/menu/buildMenuTemplate';

const actions = (): MenuActions => ({
  about: vi.fn(),
  showControl: vi.fn(),
  showSky: vi.fn(),
  restartSky: vi.fn(),
  testGrid: vi.fn(),
  fullScreen: vi.fn(),
  help: vi.fn(),
});

const items = (template: MenuItemConstructorOptions[], menu: string) =>
  template.find((m) => m.label === menu)!.submenu as MenuItemConstructorOptions[];
const names = (list: MenuItemConstructorOptions[]) =>
  list.filter((i) => i.type !== 'separator').map((i) => i.label ?? i.role);
const click = (item: MenuItemConstructorOptions, checked = false) =>
  (item.click as (i: { checked: boolean }) => void)({ checked });
const find = (list: MenuItemConstructorOptions[], label: string) =>
  list.find((i) => i.label === label)!;

describe('buildMenuTemplate', () => {
  it('has the Hide items on macOS only', () => {
    const skymap = (platform: NodeJS.Platform) =>
      names(items(buildMenuTemplate(platform, false, actions()), 'Skymap'));
    expect(skymap('darwin')).toEqual(expect.arrayContaining(['Hide Skymap', 'hideOthers']));
    expect(skymap('win32')).not.toContain('Hide Skymap');
    expect(skymap('win32')).not.toContain('hideOthers');
  });

  it('offers Reload and DevTools in --windowed dev runs only', () => {
    const view = (windowed: boolean) =>
      names(items(buildMenuTemplate('darwin', windowed, actions()), 'View'));
    expect(view(false)).not.toContain('toggleDevTools');
    expect(view(true)).toEqual(expect.arrayContaining(['reload', 'toggleDevTools']));
  });

  // A --windowed dev run has no full screen to leave or return to.
  it('offers Full screen with the platform key, outside --windowed dev runs', () => {
    const a = actions();
    const item = find(items(buildMenuTemplate('darwin', false, a), 'View'), 'Full screen');
    expect(item.accelerator).toBe('Ctrl+Cmd+F');
    click(item, false);
    expect(a.fullScreen).toHaveBeenCalledWith(false);
    expect(
      find(items(buildMenuTemplate('win32', false, a), 'View'), 'Full screen').accelerator,
    ).toBe('F11');
    expect(names(items(buildMenuTemplate('win32', true, a), 'View'))).not.toContain('Full screen');
  });

  it('sends the test grid tick it was toggled to', () => {
    const a = actions();
    const grid = find(items(buildMenuTemplate('win32', false, a), 'View'), 'Show test grid');
    click(grid, false);
    expect(a.testGrid).toHaveBeenCalledWith(false);
  });

  it('shows the global shortcut on the control-window item without taking it twice', () => {
    const item = find(
      items(buildMenuTemplate('darwin', false, actions()), 'Window'),
      'Control window',
    );
    expect(item.accelerator).toBe('CommandOrControl+Alt+K');
    expect(item.registerAccelerator).toBe(false);
  });

  it('opens Help at the section each item names', () => {
    const a = actions();
    const help = items(buildMenuTemplate('win32', false, a), 'Help');
    help.forEach((item) => click(item));
    expect(vi.mocked(a.help).mock.calls).toEqual([[], ['tablet'], ['troubleshooting']]);
  });
});
