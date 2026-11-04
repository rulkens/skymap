import type { Server } from 'node:https';

/** The app's HTTPS server, and a call that reissues its leaf for the machine's current LAN names. */
export type SecureServer = { server: Server; renewCertificate: () => Promise<void> };
