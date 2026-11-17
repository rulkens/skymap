import type { App } from 'electron';

/**
 * Whether the app has begun to quit, which is the only time the sky and control windows may close: a
 * kiosk keyboard's Alt+F4 or Cmd+W must not end the show (spec §6). `before-quit` comes from Quit,
 * the Dock, a macOS logout or shutdown and SIGTERM, never from a window's own close.
 */
export function watchQuitting(app: Pick<App, 'on'>): () => boolean {
  let quitting = false;
  app.on('before-quit', () => (quitting = true));
  return () => quitting;
}
