import type { MenuItemConstructorOptions } from 'electron';
import type { MenuActions } from './@types/MenuActions';
import { CONTROL_SHORTCUT } from '../../data/controlShortcut';

/**
 * The application menu, the same on both platforms bar macOS's Hide items. Reload and DevTools are
 * for `--windowed` dev runs only. The control-window item shows the global shortcut without
 * registering it again.
 */
export function buildMenuTemplate(
  platform: NodeJS.Platform,
  windowed: boolean,
  actions: MenuActions,
): MenuItemConstructorOptions[] {
  const hide: MenuItemConstructorOptions[] =
    platform === 'darwin'
      ? [
          { label: 'Hide Skymap', role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
        ]
      : [];
  const dev: MenuItemConstructorOptions[] = windowed
    ? [{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }]
    : [];
  return [
    {
      label: 'Skymap',
      submenu: [
        { label: 'About Skymap', click: actions.about },
        { type: 'separator' },
        ...hide,
        { label: 'Quit Skymap', accelerator: 'CommandOrControl+Q', role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Restart sky', click: actions.restartSky },
        {
          id: 'testGrid',
          label: 'Show test grid',
          type: 'checkbox',
          click: (item) => actions.testGrid(item.checked),
        },
        ...dev,
      ],
    },
    {
      label: 'Window',
      submenu: [
        {
          label: 'Control window',
          accelerator: CONTROL_SHORTCUT,
          registerAccelerator: false,
          click: actions.showControl,
        },
        { label: 'Sky', click: actions.showSky },
      ],
    },
    {
      label: 'Help',
      role: 'help',
      submenu: [
        { label: 'Skymap Help', click: () => actions.help() },
        { label: 'Connecting a tablet', click: () => actions.help('tablet') },
        { label: 'Troubleshooting', click: () => actions.help('troubleshooting') },
      ],
    },
  ];
}
