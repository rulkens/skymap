import { app, BrowserWindow, Menu } from 'electron';
import type { MenuActions } from './@types/MenuActions';
import { buildMenuTemplate } from './buildMenuTemplate';

/**
 * Hangs the menu where only the person running the show reaches it, so a visitor's keyboard on the
 * sky has no Cmd+Q, Cmd+H or Cmd+W. macOS has one menu bar for the app: it carries the menu while
 * the control window, its About, or a sky the operator made a window (`skyIsWindow`) has focus, and
 * nothing while a show's full-screen sky does. Windows hangs it on the control window alone, hidden
 * until Alt. Returns a setter for a checkbox item's tick, which also re-hangs the menu, since the
 * Full screen tick is when the sky changes hands.
 */
export function installAppMenu(
  control: BrowserWindow,
  windowed: boolean,
  skyIsWindow: (win: BrowserWindow) => boolean,
  actions: MenuActions,
): (id: 'testGrid' | 'fullScreen', checked: boolean) => void {
  const menu = Menu.buildFromTemplate(buildMenuTemplate(process.platform, windowed, actions));
  const operatorHas = (win: BrowserWindow | null): boolean =>
    windowed ||
    win === control ||
    win?.getParentWindow() === control ||
    (win !== null && skyIsWindow(win));
  const apply = (): void => {
    if (process.platform !== 'darwin') return control.setMenu(menu);
    Menu.setApplicationMenu(operatorHas(BrowserWindow.getFocusedWindow()) ? menu : null);
  };
  Menu.setApplicationMenu(null);
  apply();
  app.on('browser-window-focus', apply);
  return (id, checked) => {
    const item = menu.getMenuItemById(id);
    if (item) item.checked = checked;
    apply();
  };
}
