import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

const fakeWindow = () =>
  Object.assign(new EventEmitter(), { show: vi.fn(), focus: vi.fn(), hide: vi.fn() });

vi.mock('../../../src/main/windows/utils/createControlPageWindow', () => ({
  createControlPageWindow: () => fakeWindow(),
}));

const { openControlWindow } = await import('../../../src/main/windows/openControlWindow');
const { watchQuitting } = await import('../../../src/main/windows/watchQuitting');
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('openControlWindow', () => {
  it('shows only after the first paint', async () => {
    const { window, show } = openControlWindow(() => false);
    show();
    await settle();
    expect(window.show).not.toHaveBeenCalled();
    window.emit('ready-to-show');
    await settle();
    expect(window.show).toHaveBeenCalled();
  });

  // Regression: a launch with data awaited a scan between opening and listening, so a page that
  // painted first left every later show waiting forever.
  it('shows after a paint that came before anyone asked', async () => {
    const { window, show } = openControlWindow(() => false);
    window.emit('ready-to-show');
    await settle();
    show();
    await settle();
    expect(window.show).toHaveBeenCalled();
  });

  // A kiosk keyboard's Alt+F4 or Cmd+W must not end the show; a quit (menu, Dock, logout, SIGTERM) must.
  it('refuses a close until the app starts quitting', () => {
    const app = new EventEmitter();
    const { window } = openControlWindow(watchQuitting(app as never));
    const close = () => {
      const event = { preventDefault: vi.fn() };
      window.emit('close', event);
      return event.preventDefault;
    };
    expect(close()).toHaveBeenCalled();
    expect(window.hide).toHaveBeenCalled();
    app.emit('before-quit');
    expect(close()).not.toHaveBeenCalled();
  });
});
