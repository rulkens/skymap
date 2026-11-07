import type { HelpSection } from '../../../@types/HelpSection';

/** What the application menu's items do; main supplies them, buildMenuTemplate only places them. */
export type MenuActions = {
  about: () => void;
  showControl: () => void;
  showSky: () => void;
  restartSky: () => void;
  testGrid: (on: boolean) => void;
  fullScreen: (on: boolean) => void;
  help: (section?: HelpSection) => void;
  /** Opens a docs page in the browser; `path` is relative to DOCS_BASE, with its trailing slash. */
  openDocs: (path: string) => void;
};
