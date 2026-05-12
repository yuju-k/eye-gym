const { app, BrowserWindow, screen, session, Tray, Menu, nativeImage, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const notifier = require('node-notifier');

let win = null;
let popupWin = null;
let tray = null;
let dimWin = null;
let currentDimOpacity = 0;
let dimFadeTimer = null;

function createDimOverlay() {
  const { bounds } = screen.getPrimaryDisplay();
  dimWin = new BrowserWindow({
    x: bounds.x, y: bounds.y,
    width: bounds.width, height: bounds.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  dimWin.setAlwaysOnTop(true, 'screen-saver');
  dimWin.setIgnoreMouseEvents(true);
  dimWin.loadFile('dim-overlay.html');
}

function fadeDimOverlay(targetOpacity) {
  if (dimFadeTimer) { clearInterval(dimFadeTimer); dimFadeTimer = null; }
  if (targetOpacity > 0 && !dimWin.isVisible()) {
    dimWin.setOpacity(0);
    dimWin.show();
  }
  dimFadeTimer = setInterval(() => {
    const step = 0.02;
    if (currentDimOpacity < targetOpacity) currentDimOpacity = Math.min(targetOpacity, currentDimOpacity + step);
    else if (currentDimOpacity > targetOpacity) currentDimOpacity = Math.max(targetOpacity, currentDimOpacity - step);
    if (!dimWin.isDestroyed()) dimWin.setOpacity(currentDimOpacity);
    if (currentDimOpacity === targetOpacity) {
      clearInterval(dimFadeTimer); dimFadeTimer = null;
      if (targetOpacity === 0) dimWin.hide();
    }
  }, 50);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1100,
    minHeight: 760,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-dashboard.js'),
    }
  });

  win.loadFile('okumong-dashboard.html');
  win.once('ready-to-show', () => win.show());
  win.webContents.setBackgroundThrottling(false);

  win.on('close', (e) => {
    e.preventDefault();
    win.hide();
  });
}

function createPopup() {
  popupWin = new BrowserWindow({
    width: 300,
    height: 360,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-popup.js'),
    }
  });

  popupWin.loadFile('popup.html');

  // 포커스 잃으면 닫기
  popupWin.on('blur', () => popupWin.hide());
}

function togglePopup() {
  if (popupWin.isVisible()) {
    popupWin.hide();
    return;
  }

  // 트레이 아이콘 위치 기준으로 팝업 위치 계산
  const trayBounds = tray.getBounds();
  const popupBounds = popupWin.getBounds();
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - popupBounds.width / 2);
  const y = Math.round(trayBounds.y + trayBounds.height + 4);

  popupWin.setPosition(x, y);
  popupWin.show();
  popupWin.focus();
}

function createTray() {
  const icon = nativeImage
    .createFromPath(path.join(__dirname, 'images/좋음.png'))
    .resize({ width: 16, height: 16 });

  tray = new Tray(icon);
  tray.setToolTip('오큐몽');

  const menu = Menu.buildFromTemplate([
    { label: '대시보드 열기', click: () => { win.show(); win.focus(); } },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() },
  ]);

  // 좌클릭 → 커스텀 팝업, 우클릭 → 네이티브 메뉴
  tray.on('click', togglePopup);
  tray.on('right-click', () => tray.popUpContextMenu(menu));
}

ipcMain.on('state-update', (_event, state) => {
  if (popupWin && !popupWin.isDestroyed()) {
    popupWin.webContents.send('update-state', state);
  }
});

ipcMain.on('show-dashboard', (_event, view) => {
  popupWin.hide();
  win.show();
  win.focus();
  if (view) win.webContents.send('navigate', view);
});

ipcMain.handle('set-dim-overlay', (_event, { opacity }) => {
  fadeDimOverlay(opacity);
});

ipcMain.on('show-notification', (_event, { title, body, navigateTo }) => {
  notifier.notify({ title, message: body, sound: true, wait: !!navigateTo }, (err, res) => {
    if (navigateTo && res === 'activate') {
      if (win && !win.isDestroyed()) {
        win.show();
        win.focus();
        win.webContents.send('navigate', navigateTo);
      }
    }
  });
});



const sessionsDir = path.join(app.getPath('userData'), 'sessions');

ipcMain.handle('save-session', (_event, dateStr, data) => {
  if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(path.join(sessionsDir, `${dateStr}.json`), JSON.stringify(data), 'utf-8');
});

ipcMain.handle('load-session', (_event, dateStr) => {
  const filePath = path.join(sessionsDir, `${dateStr}.json`);
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
  catch { return null; }
});

ipcMain.handle('save-csv', async (_event, csvString) => {
  const defaultName = `okumong-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.csv`;
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: '측정 데이터 저장',
    defaultPath: path.join(app.getPath('downloads'), defaultName),
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(filePath, csvString, 'utf-8');
  return { ok: true, filePath };
});

ipcMain.on('quit-app', () => app.quit());

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (['media', 'camera', 'microphone'].includes(permission)) callback(true);
    else callback(false);
  });

  session.defaultSession.setDevicePermissionHandler((details) => {
    if (details.deviceType === 'camera') return true;
    return false;
  });

  createWindow();
  createPopup();
  createTray();
  createDimOverlay();
});

app.on('before-quit', (e) => {
  e.preventDefault();
  if (win && !win.isDestroyed()) {
    win.webContents.send('before-quit');
    ipcMain.once('quit-ready', () => app.exit());
    setTimeout(() => app.exit(), 3000); // 3초 안에 저장 못 하면 강제 종료
  } else {
    app.exit();
  }
});

app.on('window-all-closed', () => {});

app.on('activate', () => {
  win.show();
  win.focus();
});
