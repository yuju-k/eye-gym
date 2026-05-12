const { app, BrowserWindow, screen, session, Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');

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
    { label: '종료', click: () => app.exit() },
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


ipcMain.on('quit-app', () => app.exit());

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

app.on('window-all-closed', () => {});

app.on('activate', () => {
  win.show();
  win.focus();
});
