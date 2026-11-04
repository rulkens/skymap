import type { Server } from 'node:https';

/** The running app server, and how to stop it (tests start and stop their own). */
export type AppServer = { server: Server; close: () => Promise<void> };
