import type { RemoteCommandPayloads } from './RemoteCommandPayloads';

/** A named command with its own payload type, discriminated on `name`. */
export type RemoteCommand = {
  [K in keyof RemoteCommandPayloads]: { name: K; payload: RemoteCommandPayloads[K] };
}[keyof RemoteCommandPayloads];
