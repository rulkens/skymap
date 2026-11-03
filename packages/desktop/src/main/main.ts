// Placeholder window until the server and sync tasks land.
import { app, BrowserWindow } from 'electron';

const windowed = process.argv.includes('--windowed');

void app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1280, height: 720, fullscreen: !windowed });
  void win.loadURL('about:blank');
});

app.on('window-all-closed', () => app.quit());
