import type { Server } from 'node:https';

/** The app's HTTPS server, its CA (for the tablet setup page), and a call that reissues its leaf for the machine's current LAN names. */
export type SecureServer = { server: Server; caPem: string; renewCertificate: () => Promise<void> };
