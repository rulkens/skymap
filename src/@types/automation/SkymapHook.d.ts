import type { AppDispatch, RootState } from '../../store/types';

/** What every Playwright tool shares, installed on every page load as `window.__skymap`. */
export type SkymapHook = {
  /** Resolves once the app is stably ready; created on first read. */
  readonly ready: Promise<void>;
  readonly dispatch: AppDispatch;
  readonly getState: () => RootState;
  /** Resolves after the next frame callback returns. */
  readonly nextFrame: () => Promise<void>;
  /** Absolute path of the checkout this build came from; `''` in a built bundle. */
  readonly projectRoot: string;
};
