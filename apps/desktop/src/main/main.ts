import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DesktopApiGateway } from './desktop-api-gateway.js';
import { isAllowedTopLevelNavigation } from './navigation-policy.js';
import { registerRuntimeHandlers } from './runtime-handlers.js';
import { DeviceIdStore } from './workspace/device-id-store.js';
import { WorkspaceStore } from './workspace/workspace-store.js';
import { WorkspaceService } from './workspace/workspace-service.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

function createWindow() {
  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(dirname, 'preload.js')
    }
  });

  const developmentUrl = process.env.VITE_DEV_SERVER_URL;
  const packagedUrl = pathToFileURL(
    path.join(dirname, '../../renderer/index.html')
  ).toString();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedTopLevelNavigation(url, developmentUrl, packagedUrl))
      event.preventDefault();
  });
  if (developmentUrl) {
    void window.loadURL(developmentUrl);
  } else {
    void window.loadURL(packagedUrl);
  }
}

app.whenReady().then(async () => {
  const gateway = new DesktopApiGateway({
    baseUrl: process.env.EMPLOYEE_API_BASE_URL ?? 'http://127.0.0.1:3000'
  });
  const directory = app.getPath('userData');
  const workspace = new WorkspaceService({
    gateway,
    dialog: {
      showOpenDialog: () =>
        dialog.showOpenDialog({ properties: ['openDirectory'] })
    },
    store: new WorkspaceStore(directory),
    deviceId: await new DeviceIdStore(directory).get()
  });
  registerRuntimeHandlers(
    ipcMain,
    gateway,
    {
      platform: process.platform,
      appVersion: app.getVersion()
    },
    workspace
  );
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
