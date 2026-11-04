/** What a sky load needs from the app; kept apart from Electron so the load rules are testable. */
export type SkyLoaderDeps = {
  prune: () => Promise<unknown>;
  show: () => Promise<void>;
  logError: (message: string, error: unknown) => void;
};
