import type { VisibilityEntryCommon } from './VisibilityEntryCommon';

/** Something a Layer can show: addressed by `key` (or `key:<item>`), switched by `enabled`. */
export type ShowEntry = VisibilityEntryCommon & {
  readonly key: string;
  readonly field?: 'enabled';
};
