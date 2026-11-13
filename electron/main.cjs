// Electron Main Process for WorkBuddy Tools
const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');

// Domain Cookie Jar (mirrors PostAPI Cookie Manager behavior for workbuddy.cn)
const domainCookieJar = {
  cb_login_mode: 'v2',
  cb_login_realm: 'copilot',
};

// Native Node.js fetch proxy for WorkBuddy desktop app (bypasses browser CORS & enforces official headers)
ipcMain.handle('workbuddy:proxy', async (_event, { url, method = 'GET', headers = {}, body }) => {
  try {
    if (!url || !url.startsWith('https://www.workbuddy.cn')) {
      return { ok: false, status: 400, data: { error: 'Invalid WorkBuddy URL' } };
    }

    const baseHeaders = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,zh-TW;q=0.8,en;q=0.7',
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/json',
      'X-Client-Platform': 'web',
      Origin: 'https://www.workbuddy.cn',
      Referer: url.includes('/billing')
        ? 'https://www.workbuddy.cn/profile/plans-usage'
        : 'https://www.workbuddy.cn/profile/growth-center',
      'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': process.platform === 'darwin' ? '"macOS"' : '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
    };

    const requestHeaders = { ...baseHeaders };
    const lowerToCanonical = {};
    for (const k of Object.keys(requestHeaders)) {
      lowerToCanonical[k.toLowerCase()] = k;
    }

    for (const [rawKey, rawVal] of Object.entries(headers || {})) {
      if (rawVal === undefined || rawVal === null) continue;
      const lower = rawKey.toLowerCase();
      if (lower === 'host' || lower === 'content-length' || lower === 'connection') continue;
      const existingKey = lowerToCanonical[lower];
      if (existingKey) {
        requestHeaders[existingKey] = String(rawVal);
      } else {
        requestHeaders[rawKey] = String(rawVal);
        lowerToCanonical[lower] = rawKey;
      }
    }

    const cookieKey = lowerToCanonical['cookie'] || 'Cookie';
    const currentCookie = requestHeaders[cookieKey] || '';
    if (currentCookie && currentCookie.includes('session=')) {
      const missingPairs = [];
      for (const [ck, cv] of Object.entries(domainCookieJar)) {
        const regex = new RegExp(`(?:^|;\\s*)${ck}=`, 'i');
        if (!regex.test(currentCookie)) {
          missingPairs.push(`${ck}=${cv}`);
        }
      }
      if (missingPairs.length > 0) {
        requestHeaders[cookieKey] = `${missingPairs.join('; ')}; ${currentCookie}`;
      }
    }

    const fetchOptions = {
      method,
      headers: requestHeaders,
    };

    if (body !== undefined && body !== null && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const wbResponse = await fetch(url, fetchOptions);

    const setCookies =
      typeof wbResponse.headers.getSetCookie === 'function'
        ? wbResponse.headers.getSetCookie()
        : [wbResponse.headers.get('set-cookie')].filter(Boolean);
    for (const sc of setCookies) {
      if (typeof sc === 'string') {
        const firstPart = (sc.split(';')[0] || '').trim();
        if (firstPart && firstPart.includes('=')) {
          const [k, v] = firstPart.split('=', 2);
          if (k && v && k.trim() !== 'session' && k.trim() !== 'session_2') {
            domainCookieJar[k.trim()] = v.trim();
          }
        }
      }
    }

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
  // Remove default ugly "File Edit View Window" menu bar on Windows/Linux
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
  }

  const iconFile = process.platform === 'win32' ? 'icons/icon.ico' : 'icons/icon.png';

  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1024,
    minHeight: 720,
    frame: true,
    autoHideMenuBar: true,
    titleBarStyle: 'default',
    title: 'WorkBuddy 账号日常工具 v1.1.0',
    icon: path.join(__dirname, iconFile),
    backgroundColor: '#020617',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  win.setMenuBarVisibility(false);

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
