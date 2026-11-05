import type { CONTROL_CHANNELS } from '../../../data/controlChannels';

/** Main's answer to each request the page may invoke; IPC arguments are untrusted, so `unknown`. */
export type ControlIpcHandlers = {
  [K in Exclude<keyof typeof CONTROL_CHANNELS, 'state' | 'help'>]: (...args: unknown[]) => unknown;
};
