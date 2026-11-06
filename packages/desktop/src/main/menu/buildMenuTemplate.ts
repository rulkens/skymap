import type { MenuItemConstructorOptions } from 'electron';
import type { MenuActions } from './@types/MenuActions';
import { CONTROL_SHORTCUT } from '../../data/controlShortcut';
import { fullScreenAccelerator } from '../windows/utils/fullScreenAccelerator';

/**
 * The application menu, the same on both platforms bar macOS's Hide items. Reload and DevTools are
 * for `--windowed` dev runs only, which have no full screen. Settings… carries CONTROL_SHORTCUT; the
 * Full screen item shows its key without registering it, since the sky reads that key itself
 * (createSkyWindows), as it does the control key for a full-screen sky with no menu.
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
    : [
        {
          id: 'fullScreen',
          label: 'Full screen',
          type: 'checkbox',
          checked: true,
          accelerator: fullScreenAccelerator(platform),
          registerAccelerator: false,
          click: (item) => actions.fullScreen(item.checked),
        },
      ];
  return [
    {
      label: 'Skymap',
      submenu: [
        { label: 'About Skymap', click: actions.about },
        { type: 'separator' },
        // Where both platforms look for settings; it opens the control window, which holds them.
        { label: 'Settings…', accelerator: CONTROL_SHORTCUT, click: actions.showControl },
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
        { type: 'separator' },
        { label: 'Skymap documentation', click: () => actions.openDocs('') },
        { label: 'Setting up a dome', click: () => actions.openDocs('guide/dome-setup/') },
        {
          label: 'Screens and domes',
          click: () => actions.openDocs('guide/screens-and-domes/'),
        },
      ],
    },
  ];
}
