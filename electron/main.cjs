// Electron Main Process for WorkBuddy Tools
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

// Native Node.js fetch proxy for WorkBuddy desktop app (bypasses browser CORS & enforces official headers)
ipcMain.handle('workbuddy:proxy', async (_event, { url, method = 'GET', headers = {}, body }) => {
  try {
    if (!url || !url.startsWith('https://www.workbuddy.cn')) {
      return { ok: false, status: 400, data: { error: 'Invalid WorkBuddy URL' } };
    }

    const requestHeaders = {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Content-Type': 'application/json',
      'X-Client-Platform': 'web',
      Origin: 'https://www.workbuddy.cn',
      Referer: url.includes('/billing')
        ? 'https://www.workbuddy.cn/profile/plans-usage'
        : 'https://www.workbuddy.cn/profile/growth-center',
      'Sec-Ch-Ua': '"Chromium";v="152", "Not?A_Brand";v="24", "Google Chrome";v="152"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': process.platform === 'darwin' ? '"macOS"' : '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      ...headers,
    };

    if (
      requestHeaders['Cookie'] &&
      requestHeaders['Authorization'] &&
      !requestHeaders['Authorization'].startsWith('Bearer ey')
    ) {
      delete requestHeaders['Authorization'];
    }

    const fetchOptions = {
      method,
      headers: requestHeaders,
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const wbResponse = await fetch(url, fetchOptions);
    const contentType = wbResponse.headers.get('content-type') || '';
    let data = {};
    if (contentType.includes('application/json')) {
      data = await wbResponse.json().catch(() => ({}));
    } else {
      const text = await wbResponse.text().catch(() => '');
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }

    return {
      ok: wbResponse.ok && wbResponse.status < 400,
      status: wbResponse.status,
      data,
    };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      data: { error: err && err.message ? err.message : 'Electron proxy error' },
    };
  }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 700,
    frame: true,
    titleBarStyle: 'default',
    title: 'WorkBuddy 账号日常工具 v1.1.0',
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // Open external links in default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // In production load local dist/index.html, in dev load local dev server
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev && process.env.ELECTRON_DEV_URL) {
    win.loadURL(process.env.ELECTRON_DEV_URL);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
