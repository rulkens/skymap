import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_INSTALL_SETUP } from '../../../src/main/setup/data/defaultInstallSetup';
import type { InstallSetup } from '../../../src/@types/InstallSetup';

const fake = vi.hoisted(() => {
  const display = (id: number, width: number, x: number) => ({
    id,
    label: '',
    size: { width, height: 1000 },
    scaleFactor: 1,
    bounds: { x, y: 0, width, height: 1000 },
    workArea: { x, y: 0, width, height: 1000 },
  });
  return { display, displays: [] as ReturnType<typeof display>[], windows: [] as object[] };
});

vi.mock('electron', () => ({
  app: { quit: vi.fn() },
  screen: {
    getAllDisplays: () => fake.displays,
    getPrimaryDisplay: () => fake.displays[0],
    getDisplayMatching: (bounds: { x: number }) =>
      fake.displays.find((d) => d.bounds.x === bounds.x) ?? fake.displays[0],
  },
}));
vi.mock('../../../src/main/windows/openSkyWindow', () => ({
  openSkyWindow: vi.fn((display: { bounds: { x: number } }) => {
    let bounds = display.bounds;
    const win = {
      isDestroyed: () => false,
      on: vi.fn(),
      getBounds: () => bounds,
      setBounds: vi.fn((next: typeof bounds) => (bounds = next)),
      webContents: { on: vi.fn() },
    };
    fake.windows.push(win);
    return win;
  }),
}));
vi.mock('../../../src/main/windows/fillDisplay', () => ({ fillDisplay: vi.fn() }));
vi.mock('../../../src/main/windows/utils/setFullScreen', () => ({ setFullScreen: vi.fn() }));
vi.mock('../../../src/main/windows/utils/showWindowButtons', () => ({
  showWindowButtons: vi.fn(),
}));
vi.mock('../../../src/main/sky/showTestGrid', () => ({
  showTestGrid: vi.fn(() => ({ loaded: Promise.resolve(), close: () => Promise.resolve() })),
}));

const { createSkyWindows } = await import('../../../src/main/windows/createSkyWindows');
const { fillDisplay } = await import('../../../src/main/windows/fillDisplay');
const { showTestGrid } = await import('../../../src/main/sky/showTestGrid');
const { setFullScreen } = await import('../../../src/main/windows/utils/setFullScreen');
const { app } = await import('electron');

const laptop = fake.display(1, 1440, 0);
const projector = fake.display(7, 4096, 2000);
const control = {
  setAlwaysOnTop: vi.fn(),
  getSize: () => [960, 760],
  getBounds: () => ({ x: 100, y: 100, width: 960, height: 760 }),
  setPosition: vi.fn(),
};

function skyWindows(setup: InstallSetup) {
  return createSkyWindows({
    control: control as never,
    windowed: false,
    mayClose: () => false,
    setup: () => setup,
    onClosed: () => {},
    onFullScreen,
  });
}
const onFullScreen = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  fake.windows.length = 0;
});

describe('createSkyWindows', () => {
  it('a projector switched on after boot takes the sky back', () => {
    fake.displays = [laptop];
    const windows = skyWindows({
      ...DEFAULT_INSTALL_SETUP,
      display: { id: 7, width: 4096, height: 1000 },
    });
    windows.open();
    expect(windows.place()?.storedMissing).toBe(true);

    fake.displays = [laptop, projector];
    expect(windows.place()).toMatchObject({ sky: { id: 7, number: 2 }, storedMissing: false });
    expect(fillDisplay).toHaveBeenLastCalledWith(fake.windows[0], projector.bounds);
    expect(control.setAlwaysOnTop).toHaveBeenLastCalledWith(false, 'screen-saver');
  });

  // Work-area changes (a taskbar auto-hiding, the Dock) also fire display-metrics-changed.
  it('leaves a sky that already fills its display alone', () => {
    fake.displays = [laptop];
    const windows = skyWindows(DEFAULT_INSTALL_SETUP);
    windows.open();
    windows.place();
    expect(fillDisplay).not.toHaveBeenCalled();
  });

  // Escape drops the sky to a window; a taskbar or a projector waking must not throw it back.
  it('a sky taken out of full screen stays a window on a display change', () => {
    fake.displays = [laptop, projector];
    const windows = skyWindows({
      ...DEFAULT_INSTALL_SETUP,
      display: { id: 7, width: 4096, height: 1000 },
    });
    const win = windows.open();
    expect(windows.setFullScreen(false)).toBe(false);
    expect(setFullScreen).toHaveBeenLastCalledWith(win, false);
    expect(onFullScreen).toHaveBeenLastCalledWith(false);

    fake.displays = [projector, laptop];
    windows.place();
    expect(fillDisplay).not.toHaveBeenCalled();
    expect(control.setAlwaysOnTop).toHaveBeenLastCalledWith(false, 'screen-saver');

    expect(windows.setFullScreen(true)).toBe(true);
    expect(fillDisplay).toHaveBeenLastCalledWith(win, projector.bounds);
    expect(onFullScreen).toHaveBeenLastCalledWith(true);
  });

  // A visitor's Alt+F4 or Cmd+W on the show must not end it; the operator's close on a window does.
  it('close quits only from a window, never from full screen', () => {
    fake.displays = [laptop];
    const windows = skyWindows(DEFAULT_INSTALL_SETUP);
    windows.open();
    const { on } = fake.windows[0] as { on: ReturnType<typeof vi.fn> };
    const close = on.mock.calls.find((call) => call[0] === 'close')![1] as (event: object) => void;
    const event = { preventDefault: vi.fn() };
    close(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(app.quit).not.toHaveBeenCalled();
    windows.setFullScreen(false);
    close(event);
    expect(app.quit).toHaveBeenCalledOnce();
  });

  it('moves the control window only when it is not on its own display', () => {
    fake.displays = [laptop];
    const windows = skyWindows(DEFAULT_INSTALL_SETUP);
    windows.place();
    expect(control.setPosition).not.toHaveBeenCalled();
    fake.displays = [projector, laptop];
    windows.place();
    expect(control.setPosition).toHaveBeenCalledOnce();
  });

  it('the test grid opens a sky window when there is none, labelled with its display number', () => {
    fake.displays = [laptop, projector];
    const windows = skyWindows({
      ...DEFAULT_INSTALL_SETUP,
      display: { id: 7, width: 4096, height: 1000 },
    });
    expect(windows.current()).toBeNull();
    expect(windows.setTestGrid(true)).toBe(true);
    expect(fake.windows).toHaveLength(1);
    expect(showTestGrid).toHaveBeenCalledWith(fake.windows[0], 'kiosk', 2);
    expect(windows.setTestGrid(false)).toBe(false);
    expect(fake.windows).toHaveLength(1);
  });
});
