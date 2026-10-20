/** runRemoteCommand — the parsed command's registry row builds its actions; the caller dispatches them in order. */

import type { UnknownAction } from '@reduxjs/toolkit';
import { REMOTE_COMMANDS } from './remoteCommands';
import type { RemoteCommandEnv } from '../@types/remote/RemoteCommandEnv';
import type { RemoteCommandPayloads } from '../@types/remote/RemoteCommandPayloads';

// Generic over the name, so the row and the payload are typed together; a
// `RemoteCommand` argument infers `K` from its own arm.
export function runRemoteCommand<K extends keyof RemoteCommandPayloads>(
  command: { name: K; payload: RemoteCommandPayloads[K] },
  env: RemoteCommandEnv,
): UnknownAction[] {
  return REMOTE_COMMANDS[command.name].toActions(command.payload, env);
}
