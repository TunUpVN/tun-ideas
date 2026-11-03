// Tun Ideas — bản Windows (Electron)
const { app, BrowserWindow, shell, Menu, dialog } = require('electron');
const path = require('path');
const { startServer } = require('./server');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let win = null;
  let origin = '';

  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(async () => {
    let port;
    try {
      ({ port } = await startServer({
        configDir: app.getPath('userData'),
        publicDir: path.join(__dirname, '..', 'web'),
        desktop: true,
      }));
    } catch (e) {
      dialog.showErrorBox('Tun Ideas', 'Không khởi động được: ' + e.message);
      app.quit();
      return;
    }
    origin = `http://127.0.0.1:${port}`;

    Menu.setApplicationMenu(null);
    win = new BrowserWindow({
      width: 1400, height: 900, minWidth: 380, minHeight: 600,
      title: 'Tun Ideas',
      icon: path.join(__dirname, 'icon.png'),
      backgroundColor: '#e6dcc3',
      autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, sandbox: true },
    });

    // Link ra ngoài (trang lấy key, hướng dẫn...) mở bằng trình duyệt mặc định
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e, url) => {
      if (!url.startsWith(origin)) { e.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); }
    });

    win.loadURL(origin + '/');
  });

  app.on('window-all-closed', () => app.quit());
}
