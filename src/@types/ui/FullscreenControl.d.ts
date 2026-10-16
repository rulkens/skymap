/** What `useFullscreen` hands a caller: whether the API exists, the live state, and the toggle. */
export type FullscreenControl = {
  readonly supported: boolean;
  readonly active: boolean;
  readonly toggle: () => void;
};
