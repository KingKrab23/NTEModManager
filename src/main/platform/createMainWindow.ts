import { BrowserWindow } from 'electron';
import { join } from 'node:path';

const DEFAULT_WINDOW_SIZE = {
  height: 880,
  width: 1440,
};

export async function createMainWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: DEFAULT_WINDOW_SIZE.width,
    height: DEFAULT_WINDOW_SIZE.height,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#0b1020',
    autoHideMenuBar: true,
    title: 'NTE Mod Manager',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, '..', '..', 'preload', 'index.js'),
      sandbox: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    await window.loadURL(devServerUrl);

    if (process.env.ELECTRON_OPEN_DEVTOOLS === '1') {
      window.webContents.openDevTools({ mode: 'detach' });
    }

    return window;
  }

  await window.loadFile(join(__dirname, '..', '..', 'renderer', 'index.html'));
  return window;
}
