import { app, dialog } from 'electron';
import { runLifecycle } from './lifecycle/runLifecycle';

// Electron shows an uncaught main-process error as a modal dialog, which would sit over a public sky.
process.on('uncaughtException', (error) => console.error('uncaught:', error));
process.on('unhandledRejection', (reason) => console.error('unhandled rejection:', reason));

runLifecycle(process.argv.includes('--windowed')).catch((error: unknown) => {
  dialog.showErrorBox('Skymap could not start', String(error));
  app.exit(1);
});
