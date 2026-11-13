// Electron Main Process for WorkBuddy Tools (with kuaixuntong-style Stream Updater & CORS Proxy)
const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const fs = require('fs');
const path = require('path');

let mainWindow = null;

// Domain Cookie Jar (mirrors PostAPI Cookie Manager behavior for workbuddy.cn)
const domainCookieJar = {
  cb_login_mode: 'v2',
  cb_login_realm: 'copilot',
};

// Accurate OS & CPU chip architecture detection (including Rosetta 2 translation detection on Apple Silicon)
function getSystemInfo() {
  const platform = process.platform;
  const isWin = platform === 'win32';
  const isMac = platform === 'darwin';
  let arch = process.arch; // 'arm64' or 'x64'

  if (isMac && arch === 'x64') {
    try {
      const { execSync } = require('child_process');
      const translated = execSync('sysctl -in sysctl.proc_translated', { timeout: 1000 }).toString().trim();
      if (translated === '1') {
        arch = 'arm64';
      }
    } catch {
      // ignore
    }
  }

  let archName = 'x64 (64位)';
  let platformName = 'Windows';
  let envType = 'win-x64';

  if (isWin) {
    platformName = 'Windows';
    archName = 'x64 (64位)';
    envType = 'win-x64';
  } else if (isMac) {
    platformName = 'macOS';
    archName = arch === 'arm64' ? 'Apple Silicon (M系列芯片)' : 'Intel 芯片';
    envType = arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
  }

  return {
    platform,
    isWin,
    isMac,
    arch,
    envType,
    archName,
    platformName,
    summary: `${platformName} (${archName})`,
  };
}

function getAcceleratedDownloadUrls(rawUrl, customNode = 'auto') {
  const cleanRaw = String(rawUrl || '').trim();
  if (!cleanRaw.includes('github.com')) {
    return [{ url: cleanRaw, name: '直连源' }];
  }
  const mirrorFast = `https://ghfast.top/${cleanRaw}`;
  const mirrorProxy = `https://gh-proxy.com/${cleanRaw}`;

  if (customNode === 'ghfast') {
    return [
      { url: mirrorFast, name: '⚡ 智能高速镜像 (GHFast CDN)' },
      { url: mirrorProxy, name: '🚀 国内备用镜像 (GH-Proxy CDN)' },
      { url: cleanRaw, name: '🌐 GitHub 官方源 (直连)' },
    ];
  } else if (customNode === 'ghproxy') {
    return [
      { url: mirrorProxy, name: '🚀 国内备用镜像 (GH-Proxy CDN)' },
      { url: mirrorFast, name: '⚡ 智能高速镜像 (GHFast CDN)' },
      { url: cleanRaw, name: '🌐 GitHub 官方源 (直连)' },
    ];
  } else if (customNode === 'official') {
    return [
      { url: cleanRaw, name: '🌐 GitHub 官方源 (直连)' },
      { url: mirrorFast, name: '⚡ 智能高速镜像 (GHFast CDN)' },
    ];
  }
  return [
    { url: mirrorFast, name: '⚡ 智能高速镜像 (GHFast CDN)' },
    { url: mirrorProxy, name: '🚀 国内备用镜像 (GH-Proxy CDN)' },
    { url: cleanRaw, name: '🌐 GitHub 官方源 (直连)' },
  ];
}

const GITHUB_REPO = 'dengwka/workBuddyTools';

async function fetchLatestReleaseInfo() {
  try {
    const apiRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'WorkBuddyTools-Updater/1.3.1',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data && data.tag_name && Array.isArray(data.assets) && data.assets.length > 0) {
        return data;
      }
    }
  } catch {
    // fallback to HTML/mirror release parser below
  }

  const releasePageBases = [
    `https://github.com/${GITHUB_REPO}/releases/latest`,
    `https://ghfast.top/https://github.com/${GITHUB_REPO}/releases/latest`,
    `https://gh-proxy.com/https://github.com/${GITHUB_REPO}/releases/latest`,
  ];

  for (const pageUrl of releasePageBases) {
    try {
      const res = await fetch(pageUrl, {
        redirect: 'follow',
        headers: { 'User-Agent': 'WorkBuddyTools-Updater/1.3.1' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const tagMatch =
        res.url.match(/\/releases\/tag\/([^/?#]+)/) ||
        html.match(/\/dengwka\/workBuddyTools\/releases\/tag\/([^"/?#<]+)/);
      const tagName = tagMatch ? decodeURIComponent(tagMatch[1]) : '';
      if (!tagName) continue;

      const expandedUrl = pageUrl.startsWith('https://ghfast.top/')
        ? `https://ghfast.top/https://github.com/${GITHUB_REPO}/releases/expanded_assets/${tagName}`
        : pageUrl.startsWith('https://gh-proxy.com/')
        ? `https://gh-proxy.com/https://github.com/${GITHUB_REPO}/releases/expanded_assets/${tagName}`
        : `https://github.com/${GITHUB_REPO}/releases/expanded_assets/${tagName}`;

      const expRes = await fetch(expandedUrl, {
        headers: { 'User-Agent': 'WorkBuddyTools-Updater/1.3.1' },
        signal: AbortSignal.timeout(10000),
      });
      const expHtml = expRes.ok ? await expRes.text() : html;
      const assetRegex = new RegExp(`href="([^"]*/${GITHUB_REPO}/releases/download/[^"]+)"`, 'gi');
      const assets = [];
      const seen = new Set();
      let m;
      while ((m = assetRegex.exec(expHtml)) !== null) {
        const rawHref = m[1];
        const idx = rawHref.indexOf(`/${GITHUB_REPO}/releases/download/`);
        const cleanPath = idx >= 0 ? rawHref.slice(idx) : rawHref;
        const downloadUrl = `https://github.com${cleanPath}`;
        const name = decodeURIComponent(cleanPath.split('/').pop() || '');
        if (name && !seen.has(name)) {
          seen.add(name);
          assets.push({
            id: assets.length + 1,
            name,
            size: 0,
            browser_download_url: downloadUrl,
            updated_at: new Date().toISOString(),
          });
        }
      }

      if (assets.length > 0) {
        return {
          tag_name: tagName,
          name: `WorkBuddy 自动化工具 ${tagName}`,
          body: '',
          published_at: new Date().toISOString(),
          html_url: `https://github.com/${GITHUB_REPO}/releases/tag/${tagName}`,
          assets,
        };
      }
    } catch {
      // try next base
    }
  }

  return null;
}

async function executeStreamDownload(targetUrl, originalFileName, nodeName, emitProgress) {
  const controller = new AbortController();
  const connectTimer = setTimeout(() => controller.abort(), 15000);

  let res;
  try {
    res = await fetch(targetUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'WorkBuddyTools-Updater/1.3.1' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(connectTimer);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html')) {
    throw new Error('镜像节点返回了 HTML 错误页而非安装包');
  }

  const contentEncoding = (res.headers.get('content-encoding') || '').toLowerCase();
  const rawContentLen = parseInt(res.headers.get('content-length') || '0', 10);
  const totalBytes = !contentEncoding || contentEncoding === 'identity' ? rawContentLen : 0;

  const urlBasename = (() => {
    try {
      const p = new URL(targetUrl).pathname;
      return decodeURIComponent(p.split('/').pop() || '');
    } catch {
      return '';
    }
  })();

  const safeName = (originalFileName || urlBasename || `workbuddyTools-update-${Date.now()}.exe`).replace(
    /[^a-zA-Z0-9._-]/g,
    '_'
  );
  const tempDir = app.getPath('temp');
  const destPath = path.join(tempDir, `${Date.now()}-${safeName}`);

  const destStream = fs.createWriteStream(destPath);
  let receivedBytes = 0;
  let lastReportTime = Date.now();
  let lastReportBytes = 0;

  const report = (force = false) => {
    const now = Date.now();
    const deltaSec = (now - lastReportTime) / 1000;
    if (force || deltaSec >= 0.2 || (totalBytes > 0 && receivedBytes === totalBytes)) {
      const deltaBytes = receivedBytes - lastReportBytes;
      const bytesPerSec = deltaSec > 0 ? deltaBytes / deltaSec : 0;
      const speedMb = (bytesPerSec / (1024 * 1024)).toFixed(1);
      const remainingSec =
        bytesPerSec > 0 && totalBytes > receivedBytes
          ? Math.ceil((totalBytes - receivedBytes) / bytesPerSec)
          : 0;
      const percent =
        totalBytes > 0 ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) : 0;

      emitProgress({
        percent,
        receivedMb: (receivedBytes / (1024 * 1024)).toFixed(1),
        totalMb: totalBytes > 0 ? (totalBytes / (1024 * 1024)).toFixed(1) : '未知',
        speedText: `${speedMb} MB/s`,
        remainingText: remainingSec > 0 ? `剩余约 ${remainingSec} 秒` : '',
        nodeName,
        stage: 'downloading',
      });
      lastReportTime = now;
      lastReportBytes = receivedBytes;
    }
  };

  try {
    if (res.body && typeof res.body.getReader === 'function') {
      const reader = res.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.length > 0) {
          receivedBytes += value.length;
          const canContinue = destStream.write(Buffer.from(value));
          if (!canContinue) {
            await new Promise((r) => destStream.once('drain', r));
          }
          report(false);
        }
      }
      report(true);
    }
  } catch (err) {
    destStream.destroy();
    try {
      fs.unlinkSync(destPath);
    } catch {
      // ignore
    }
    throw err;
  }

  await new Promise((resolve, reject) => {
    destStream.on('close', resolve);
    destStream.on('error', reject);
    destStream.end();
  });

  const stat = fs.statSync(destPath);
  if (stat.size < 100 * 1024) {
    try {
      fs.unlinkSync(destPath);
    } catch {
      // ignore
    }
    throw new Error(`下载文件异常过小 (${stat.size} 字节)，可能为无效链接`);
  }
  if (totalBytes > 0 && stat.size !== totalBytes) {
    try {
      fs.unlinkSync(destPath);
    } catch {
      // ignore
    }
    throw new Error(`文件完整性校验未通过: 预期 ${totalBytes} 字节，实际 ${stat.size} 字节`);
  }

  emitProgress({
    percent: 100,
    receivedMb: (stat.size / (1024 * 1024)).toFixed(1),
    totalMb: (stat.size / (1024 * 1024)).toFixed(1),
    speedText: '校验通过',
    remainingText: '正在触发自动安装...',
    nodeName,
    stage: 'installing',
  });

  await new Promise((r) => setTimeout(r, 350));

  const { spawn } = require('child_process');
  if (process.platform === 'win32' && destPath.toLowerCase().endsWith('.exe')) {
    try {
      const child = spawn(destPath, [], { detached: true, stdio: 'ignore' });
      child.unref();
    } catch {
      const openErr = await shell.openPath(destPath);
      if (openErr) throw new Error(openErr);
    }
  } else {
    const openErr = await shell.openPath(destPath);
    if (openErr) throw new Error(openErr);
  }

  emitProgress({
    percent: 100,
    receivedMb: (stat.size / (1024 * 1024)).toFixed(1),
    totalMb: (stat.size / (1024 * 1024)).toFixed(1),
    speedText: '已启动安装',
    remainingText: '',
    nodeName,
    stage: 'done',
  });

  return {
    success: true,
    filePath: destPath,
    nodeName,
    autoInstalled: true,
  };
}

ipcMain.handle('workbuddy:get-system-info', () => {
  return getSystemInfo();
});

ipcMain.handle('workbuddy:check-latest-release', async () => {
  return await fetchLatestReleaseInfo();
});

ipcMain.handle('workbuddy:download-and-install', async (_event, { downloadUrl, fileName, mirrorMode = 'auto' }) => {
  const candidates = getAcceleratedDownloadUrls(downloadUrl, mirrorMode);
  const emitProgress = (progressData) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('workbuddy:update-progress', progressData);
    }
  };

  let lastError = null;
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (i > 0) {
      emitProgress({
        percent: 0,
        receivedMb: '0.0',
        totalMb: '0.0',
        speedText: '正在切换加速节点...',
        remainingText: '',
        nodeName: candidate.name,
        stage: 'downloading',
      });
    }
    try {
      return await executeStreamDownload(candidate.url, fileName, candidate.name, emitProgress);
    } catch (err) {
      lastError = err;
    }
  }
  return {
    success: false,
    error: lastError && lastError.message ? lastError.message : '所有下载源均失败',
  };
});

// Native Node.js fetch proxy for WorkBuddy desktop app
ipcMain.handle('workbuddy:proxy', async (_event, { url, method = 'GET', headers = {}, body }) => {
  try {
    const isAllowedUrl =
      typeof url === 'string' &&
      (url.startsWith('https://www.workbuddy.cn') ||
        url.startsWith('https://acc-1258344699.cos.accelerate.myqcloud.com/workbuddy/'));
    if (!isAllowedUrl) {
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

// Real WorkBuddy Cloud Sandbox ACP Turn (StreamableHTTP SSE bootstrap + session/prompt)
ipcMain.handle('workbuddy:acp-turn', async (_event, payload) => {
  const { link, token, sessionId, cwd = '/workspace', promptText, requestId } = payload || {};
  if (!link || !token || !sessionId || !promptText) {
    return { ok: false, bootstrapOk: false, promptOk: false, detail: '缺少沙箱 ACP 连接参数' };
  }

  const sseController = new AbortController();
  const overallTimer = setTimeout(() => sseController.abort(), 22000);

  try {
    const parsedLink = new URL(String(link));
    parsedLink.pathname = parsedLink.pathname.replace(/\/acp\/?$/, '/acp/bootstrap');
    const bootstrapUrl = parsedLink.toString();
    const bootstrapBody = {
      initialize: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: 1,
          clientCapabilities: {},
        },
      },
      sessionNew: {
        jsonrpc: '2.0',
        id: 2,
        method: 'session/new',
        params: {
          sessionId,
          cwd: cwd || '/workspace',
          mcpServers: [],
        },
      },
    };

    const sseRes = await fetch(bootstrapUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-Request-ID': requestId || `req_${Date.now()}`,
      },
      body: JSON.stringify(bootstrapBody),
      signal: sseController.signal,
    });

    if (!sseRes.ok) {
      return {
        ok: false,
        bootstrapOk: false,
        promptOk: false,
        status: sseRes.status,
        detail: `ACP bootstrap HTTP ${sseRes.status}`,
      };
    }

    const connId = sseRes.headers.get('acp-connection-id') || sseRes.headers.get('Acp-Connection-Id') || '';
    if (!connId) {
      return {
        ok: false,
        bootstrapOk: false,
        promptOk: false,
        status: sseRes.status,
        detail: 'ACP bootstrap 未返回 Acp-Connection-Id',
      };
    }

    // Read SSE stream in background until bootstrap responses & prompt reply arrive
    const reader = sseRes.body && typeof sseRes.body.getReader === 'function' ? sseRes.body.getReader() : null;
    const decoder = new TextDecoder();
    let sseBuffer = '';
    let bootstrapDone = false;
    let promptDone = false;
    let gotAssistantOutput = false;
    let activeSessionId = sessionId;

    const readPromise = (async () => {
      if (!reader) return;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split(/\r?\n/);
          sseBuffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const raw = line.slice(5).trim();
            if (!raw) continue;
            try {
              const msg = JSON.parse(raw);
              if (msg.id === 2 && msg.result?.sessionId) {
                activeSessionId = String(msg.result.sessionId);
              }
              if (msg.id === 1 || msg.id === 2) {
                bootstrapDone = true;
              }
              if (msg.method === 'session/update' || msg.params?.update) {
                gotAssistantOutput = true;
              }
              if (msg.id === 3) {
                promptDone = true;
              }
            } catch {
              // ignore non-JSON SSE chunks
            }
          }
          if (promptDone) break;
        }
      } catch {
        // stream aborted cleanly
      }
    })();

    // Give bootstrap a short window to settle session/new before sending session/prompt
    const bootDeadline = Date.now() + 3000;
    while (!bootstrapDone && Date.now() < bootDeadline) {
      await new Promise((r) => setTimeout(r, 120));
    }

    const promptBody = {
      jsonrpc: '2.0',
      id: 3,
      method: 'session/prompt',
      params: {
        sessionId: activeSessionId,
        prompt: [{ type: 'text', text: String(promptText) }],
        _meta: {
          'codebuddy.ai': {
            telemetryClientInfo: {
              ideType: 'desktop',
              ideName: 'WorkBuddy',
            },
          },
        },
      },
    };

    const promptRes = await fetch(String(link), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'Acp-Connection-Id': connId,
        'X-Request-ID': requestId || `req_${Date.now()}`,
      },
      body: JSON.stringify(promptBody),
      signal: sseController.signal,
    });

    if (promptRes.ok) {
      const ct = (promptRes.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('application/json')) {
        const pj = await promptRes.json().catch(() => null);
        if (pj && (pj.result || pj.id === 3)) promptDone = true;
      } else if (ct.includes('text/event-stream') && promptRes.body?.getReader) {
        const pr = promptRes.body.getReader();
        const waitEnd = Date.now() + 8000;
        while (Date.now() < waitEnd && !promptDone) {
          const { done, value } = await Promise.race([
            pr.read(),
            new Promise((r) => setTimeout(() => r({ done: true, value: undefined }), 4000)),
          ]);
          if (done) break;
          if (value) {
            const chunkText = decoder.decode(value, { stream: true });
            if (chunkText.includes('stopReason') || chunkText.includes('"id":3')) {
              promptDone = true;
            }
            if (chunkText.includes('session/update') || chunkText.includes('agent_message')) {
              gotAssistantOutput = true;
            }
          }
        }
        pr.cancel().catch(() => {});
      }
    }

    // Wait briefly for SSE response completion
    const replyDeadline = Date.now() + 6000;
    while (!promptDone && !gotAssistantOutput && Date.now() < replyDeadline) {
      await new Promise((r) => setTimeout(r, 200));
    }

    sseController.abort();
    await Promise.race([readPromise, new Promise((r) => setTimeout(r, 300))]);

    return {
      ok: promptRes.ok,
      bootstrapOk: true,
      promptOk: promptRes.ok,
      gotReply: promptDone || gotAssistantOutput,
      connectionId: connId,
      status: promptRes.status,
      detail: promptRes.ok
        ? promptDone || gotAssistantOutput
          ? 'ACP 沙箱对话已发送并收到模型响应'
          : 'ACP 沙箱 session/prompt 已投递成功'
        : `ACP session/prompt 返回 HTTP ${promptRes.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      bootstrapOk: false,
      promptOk: false,
      detail: err && err.message ? err.message : 'ACP turn error',
    };
  } finally {
    clearTimeout(overallTimer);
  }
});

ipcMain.handle('workbuddy:open-external', async (_event, targetUrl) => {
  if (typeof targetUrl === 'string' && (targetUrl.startsWith('http://') || targetUrl.startsWith('https://') || targetUrl.startsWith('workbuddy://'))) {
    await shell.openExternal(targetUrl);
    return { ok: true };
  }
  return { ok: false };
});

function createWindow() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
  }

  const iconFile = process.platform === 'win32' ? 'icons/icon.ico' : 'icons/icon.png';

  mainWindow = new BrowserWindow({
    width: 1220,
    height: 780,
    minWidth: 1020,
    minHeight: 660,
    frame: true,
    autoHideMenuBar: true,
    titleBarStyle: 'default',
    title: 'WorkBuddy 自动化工具 v1.3.1',
    icon: path.join(__dirname, iconFile),
    backgroundColor: '#020617',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev && process.env.ELECTRON_DEV_URL) {
    mainWindow.loadURL(process.env.ELECTRON_DEV_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
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
