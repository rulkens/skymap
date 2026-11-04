import type { HelpSection } from '../../../@types/HelpSection';

/** What the application menu's items do; main supplies them, buildMenuTemplate only places them. */
export type MenuActions = {
  about: () => void;
  showControl: () => void;
  showSky: () => void;
  /** The control window's Quit: through the quit gate. */
  quit: () => void;
  restartSky: () => void;
  testGrid: (on: boolean) => void;
  help: (section?: HelpSection) => void;
};
