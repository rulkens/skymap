import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import type { MenuActions } from '../../../src/main/menu/@types/MenuActions';
import { buildMenuTemplate } from '../../../src/main/menu/buildMenuTemplate';

const actions = (): MenuActions => ({
  about: vi.fn(),
  showControl: vi.fn(),
  showSky: vi.fn(),
  quit: vi.fn(),
  restartSky: vi.fn(),
  testGrid: vi.fn(),
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
      names(items(buildMenuTemplate(platform, false, false, actions()), 'Skymap'));
    expect(skymap('darwin')).toEqual(expect.arrayContaining(['Hide Skymap', 'hideOthers']));
    expect(skymap('win32')).not.toContain('Hide Skymap');
    expect(skymap('win32')).not.toContain('hideOthers');
  });

  it('routes Quit through the gate, never the quit role', () => {
    const a = actions();
    const quit = find(items(buildMenuTemplate('darwin', false, false, a), 'Skymap'), 'Quit Skymap');
    expect(quit.role).toBeUndefined();
    click(quit);
    expect(a.quit).toHaveBeenCalledOnce();
  });

  it('offers Reload and DevTools in --windowed dev runs only', () => {
    const view = (windowed: boolean) =>
      names(items(buildMenuTemplate('darwin', windowed, false, actions()), 'View'));
    expect(view(false)).not.toContain('toggleDevTools');
    expect(view(true)).toEqual(expect.arrayContaining(['reload', 'toggleDevTools']));
  });

  it('shows the test grid state and sends the toggled one', () => {
    const a = actions();
    const grid = find(items(buildMenuTemplate('win32', false, true, a), 'View'), 'Show test grid');
    expect(grid.checked).toBe(true);
    click(grid, false);
    expect(a.testGrid).toHaveBeenCalledWith(false);
  });

  it('shows the global shortcut on the control-window item without taking it twice', () => {
    const item = find(
      items(buildMenuTemplate('darwin', false, false, actions()), 'Window'),
      'Control window',
    );
    expect(item.accelerator).toBe('CommandOrControl+Alt+K');
    expect(item.registerAccelerator).toBe(false);
  });

  it('opens Help at the section each item names', () => {
    const a = actions();
    const help = items(buildMenuTemplate('win32', false, false, a), 'Help');
    help.forEach((item) => click(item));
    expect(vi.mocked(a.help).mock.calls).toEqual([[], ['tablet'], ['troubleshooting']]);
  });
});
