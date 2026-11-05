import type { UnknownAction } from '@reduxjs/toolkit';
import type { RemoteCommandEnv } from './RemoteCommandEnv';

/** One registry row: its presence allow-lists the name, `parse` validates, `toActions` stamps the dome's clock. */
export type RemoteCommandSpec<P> = {
  /** `undefined` drops the message: `null` is a valid payload for the rows that carry none. */
  parse: (raw: unknown) => P | undefined;
  toActions: (payload: P, env: RemoteCommandEnv) => UnknownAction[];
};
