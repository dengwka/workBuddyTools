import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GITHUB_REPO = 'dengwka/workBuddyTools';

interface UpdateJobState {
  id: string;
  stage: 'downloading' | 'installing' | 'done' | 'error';
  percent: number;
  receivedMb: string;
  totalMb: string;
  speedText: string;
  remainingText: string;
  nodeName: string;
  fileName: string;
  filePath?: string;
  autoInstalled?: boolean;
  error?: string;
  listeners: Set<Response>;
}

const updateJobs = new Map<string, UpdateJobState>();

function getAcceleratedDownloadUrls(rawUrl: string, customNode = 'auto') {
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

async function fetchLatestReleaseInfo() {
  try {
    const apiRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'WorkBuddyTools-Updater/1.3.0',
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
    // fallback to HTML parser
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
        headers: { 'User-Agent': 'WorkBuddyTools-Updater/1.3.0' },
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
        headers: { 'User-Agent': 'WorkBuddyTools-Updater/1.3.0' },
        signal: AbortSignal.timeout(10000),
      });
      const expHtml = expRes.ok ? await expRes.text() : html;
      const assetRegex = new RegExp(`href="([^"]*/${GITHUB_REPO}/releases/download/[^"]+)"`, 'gi');
      const assets: Array<{
        id: number;
        name: string;
        size: number;
        browser_download_url: string;
        updated_at: string;
      }> = [];
      const seen = new Set<string>();
      let m: RegExpExecArray | null;
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
      // try next mirror
    }
  }

  return null;
}

function broadcastUpdateJob(job: UpdateJobState) {
  const payload = JSON.stringify({
    id: job.id,
    stage: job.stage,
    percent: job.percent,
    receivedMb: job.receivedMb,
    totalMb: job.totalMb,
    speedText: job.speedText,
    remainingText: job.remainingText,
    nodeName: job.nodeName,
    fileName: job.fileName,
    autoInstalled: job.autoInstalled,
    error: job.error,
  });
  for (const client of job.listeners) {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch {
      job.listeners.delete(client);
    }
  }
}

async function runServerStreamUpdate(job: UpdateJobState, downloadUrl: string, mirrorMode: string) {
  const candidates = getAcceleratedDownloadUrls(downloadUrl, mirrorMode);
  let lastError: Error | null = null;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    job.nodeName = candidate.name;
    if (i > 0) {
      job.percent = 0;
      job.receivedMb = '0.0';
      job.totalMb = '0.0';
      job.speedText = '正在切换加速节点...';
      job.remainingText = '';
      job.stage = 'downloading';
      broadcastUpdateJob(job);
    }

    let destPath = '';
    try {
      const controller = new AbortController();
      const connectTimer = setTimeout(() => controller.abort(), 15000);
      let res: globalThis.Response;
      try {
        res = await fetch(candidate.url, {
          redirect: 'follow',
          headers: { 'User-Agent': 'WorkBuddyTools-Updater/1.3.0' },
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
        throw new Error('镜像节点返回了 HTML 错误页');
      }

      const contentEncoding = (res.headers.get('content-encoding') || '').toLowerCase();
      const rawContentLen = parseInt(res.headers.get('content-length') || '0', 10);
      const totalBytes = !contentEncoding || contentEncoding === 'identity' ? rawContentLen : 0;

      const safeName = (job.fileName || `workbuddyTools-update-${Date.now()}.exe`).replace(
        /[^a-zA-Z0-9._-]/g,
        '_'
      );
      destPath = path.join(os.tmpdir(), `${Date.now()}-${safeName}`);
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

          job.percent = percent;
          job.receivedMb = (receivedBytes / (1024 * 1024)).toFixed(1);
          job.totalMb = totalBytes > 0 ? (totalBytes / (1024 * 1024)).toFixed(1) : '未知';
          job.speedText = `${speedMb} MB/s`;
          job.remainingText = remainingSec > 0 ? `剩余约 ${remainingSec} 秒` : '';
          job.stage = 'downloading';
          broadcastUpdateJob(job);

          lastReportTime = now;
          lastReportBytes = receivedBytes;
        }
      };

      if (res.body && typeof res.body.getReader === 'function') {
        const reader = res.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.length > 0) {
            receivedBytes += value.length;
            const canContinue = destStream.write(Buffer.from(value));
            if (!canContinue) {
              await new Promise<void>((r) => destStream.once('drain', () => r()));
            }
            report(false);
          }
        }
        report(true);
      }

      await new Promise<void>((resolve, reject) => {
        destStream.on('close', () => resolve());
        destStream.on('error', reject);
        destStream.end();
      });

      const stat = fs.statSync(destPath);
      if (stat.size < 100 * 1024) {
        throw new Error(`下载文件异常过小 (${stat.size} 字节)`);
      }
      if (totalBytes > 0 && stat.size !== totalBytes) {
        throw new Error(`完整性校验未通过: 预期 ${totalBytes} 字节，实际 ${stat.size} 字节`);
      }

      job.filePath = destPath;
      job.percent = 100;
      job.receivedMb = (stat.size / (1024 * 1024)).toFixed(1);
      job.totalMb = (stat.size / (1024 * 1024)).toFixed(1);
      job.stage = 'installing';
      job.speedText = '校验通过';
      job.remainingText = '正在触发自动安装...';
      broadcastUpdateJob(job);

      await new Promise((r) => setTimeout(r, 300));

      let autoInstalled = false;
      if (process.platform === 'win32') {
        try {
          const child = spawn('cmd.exe', ['/c', 'start', '""', destPath], {
            detached: true,
            stdio: 'ignore',
          });
          child.unref();
          autoInstalled = true;
        } catch {
          autoInstalled = false;
        }
      } else if (process.platform === 'darwin') {
        try {
          const child = spawn('open', [destPath], { detached: true, stdio: 'ignore' });
          child.unref();
          autoInstalled = true;
        } catch {
          autoInstalled = false;
        }
      }

      job.autoInstalled = autoInstalled;
      job.stage = 'done';
      job.speedText = autoInstalled ? '已自动启动安装' : '下载完成';
      job.remainingText = '';
      broadcastUpdateJob(job);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('下载失败');
      if (destPath) {
        try {
          fs.unlinkSync(destPath);
        } catch {
          // ignore
        }
      }
    }
  }

  job.stage = 'error';
  job.error = lastError?.message || '所有下载节点均失败，请检查网络后重试';
  broadcastUpdateJob(job);
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Domain Cookie Jar (mirrors PostAPI Cookie Manager behavior for workbuddy.cn)
  const domainCookieJar: Record<string, string> = {
    cb_login_mode: 'v2',
    cb_login_realm: 'copilot',
  };

  // API Proxy Route for WorkBuddy to bypass browser CORS
  app.post('/api/workbuddy/proxy', async (req: Request, res: Response) => {
    try {
      const { url, method = 'GET', headers = {}, body } = req.body;

      // Default official browser headers
      const baseHeaders: Record<string, string> = {
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
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
      };

      // Case-insensitive merge so user cURL headers (-H) cleanly override defaults
      const requestHeaders: Record<string, string> = { ...baseHeaders };
      const lowerToCanonical: Record<string, string> = {};
      for (const k of Object.keys(requestHeaders)) {
        lowerToCanonical[k.toLowerCase()] = k;
      }

      for (const [rawKey, rawVal] of Object.entries(headers as Record<string, string>)) {
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

      // Ensure Cookie Jar defaults (cb_login_mode=v2; cb_login_realm=copilot) are merged when session is present
      const cookieKey = lowerToCanonical['cookie'] || 'Cookie';
      const currentCookie = requestHeaders[cookieKey] || '';
      if (currentCookie && currentCookie.includes('session=')) {
        const missingPairs: string[] = [];
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

      const fetchOptions: RequestInit = {
        method,
        headers: requestHeaders,
        signal: AbortSignal.timeout(20000),
      };

      if (body !== undefined && body !== null && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
      }

      const wbResponse = await fetch(url, fetchOptions);

      // Update domainCookieJar from response Set-Cookie headers
      const setCookies =
        typeof (wbResponse.headers as any).getSetCookie === 'function'
          ? (wbResponse.headers as any).getSetCookie()
          : [wbResponse.headers.get('set-cookie')].filter(Boolean);
      for (const sc of setCookies) {
        if (typeof sc === 'string') {
          const firstPart = sc.split(';')[0]?.trim();
          if (firstPart && firstPart.includes('=')) {
            const [k, v] = firstPart.split('=', 2);
            if (k && v && k.trim() !== 'session' && k.trim() !== 'session_2') {
              domainCookieJar[k.trim()] = v.trim();
            }
          }
        }
      }

      const contentType = wbResponse.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const json = await wbResponse.json();
        return res.status(wbResponse.status).json(json);
      } else {
        const text = await wbResponse.text();
        return res.status(wbResponse.status).send(text);
      }
    } catch (err: unknown) {
      console.error('WorkBuddy proxy error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Proxy request failed';
      return res.status(500).json({ error: errorMsg });
    }
  });

  // Real WorkBuddy Cloud Sandbox ACP Turn (StreamableHTTP SSE bootstrap + session/prompt)
  app.post('/api/workbuddy/acp-turn', async (req: Request, res: Response) => {
    const { link, token, sessionId, cwd = '/workspace', promptText, requestId } = req.body || {};
    if (!link || !token || !sessionId || !promptText) {
      return res.status(400).json({ ok: false, bootstrapOk: false, promptOk: false, detail: '缺少沙箱 ACP 连接参数' });
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
        return res.json({
          ok: false,
          bootstrapOk: false,
          promptOk: false,
          status: sseRes.status,
          detail: `ACP bootstrap HTTP ${sseRes.status}`,
        });
      }

      const connId = sseRes.headers.get('acp-connection-id') || sseRes.headers.get('Acp-Connection-Id') || '';
      if (!connId) {
        return res.json({
          ok: false,
          bootstrapOk: false,
          promptOk: false,
          status: sseRes.status,
          detail: 'ACP bootstrap 未返回 Acp-Connection-Id',
        });
      }

      const reader = sseRes.body && typeof sseRes.body.getReader === 'function' ? sseRes.body.getReader() : null;
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let bootstrapDone = false;
      let promptDone = false;
      let gotAssistantOutput = false;
      let activeSessionId = String(sessionId);

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
                // ignore
              }
            }
            if (promptDone) break;
          }
        } catch {
          // aborted cleanly
        }
      })();

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
              new Promise<{ done: boolean; value: undefined }>((r) =>
                setTimeout(() => r({ done: true, value: undefined }), 4000)
              ),
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

      const replyDeadline = Date.now() + 6000;
      while (!promptDone && !gotAssistantOutput && Date.now() < replyDeadline) {
        await new Promise((r) => setTimeout(r, 200));
      }

      sseController.abort();
      await Promise.race([readPromise, new Promise((r) => setTimeout(r, 300))]);

      return res.json({
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
      });
    } catch (err: unknown) {
      return res.status(500).json({
        ok: false,
        bootstrapOk: false,
        promptOk: false,
        detail: err instanceof Error ? err.message : 'ACP turn failed',
      });
    } finally {
      clearTimeout(overallTimer);
    }
  });

  // Reliable GitHub Latest Release resolver (avoids frontend API rate-limit & 404 URLs)
  app.get('/api/update/latest', async (_req: Request, res: Response) => {
    try {
      const release = await fetchLatestReleaseInfo();
      if (!release) {
        return res.status(502).json({ error: '暂时无法获取 GitHub Release 列表' });
      }
      return res.json(release);
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Check update failed' });
    }
  });

  // Start stream download & automatic local OS installer trigger (no browser redirect!)
  app.post('/api/update/download-and-install', (req: Request, res: Response) => {
    const { downloadUrl, fileName, mirrorMode = 'auto' } = req.body || {};
    if (!downloadUrl || typeof downloadUrl !== 'string' || !downloadUrl.startsWith('https://')) {
      return res.status(400).json({ error: '无效的安装包下载地址' });
    }

    const jobId = `upd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const job: UpdateJobState = {
      id: jobId,
      stage: 'downloading',
      percent: 0,
      receivedMb: '0.0',
      totalMb: '0.0',
      speedText: '正在连接高速节点...',
      remainingText: '',
      nodeName: '智能加速引擎',
      fileName: String(fileName || 'workbuddyTools-update.exe'),
      listeners: new Set(),
    };
    updateJobs.set(jobId, job);

    // Run asynchronously so client receives SSE progress immediately
    runServerStreamUpdate(job, downloadUrl, String(mirrorMode || 'auto'));

    return res.json({ jobId });
  });

  // SSE Progress Stream for Web mode
  app.get('/api/update/progress', (req: Request, res: Response) => {
    const jobId = String(req.query.jobId || '');
    const job = updateJobs.get(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Update job not found' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    job.listeners.add(res);
    broadcastUpdateJob(job);

    req.on('close', () => {
      job.listeners.delete(res);
    });
  });

  // Local verified binary stream endpoint (fallback when running in headless Linux cloud container)
  app.get('/api/update/file', (req: Request, res: Response) => {
    const jobId = String(req.query.jobId || '');
    const job = updateJobs.get(jobId);
    if (!job || !job.filePath || !fs.existsSync(job.filePath)) {
      return res.status(404).send('File not ready');
    }
    return res.download(job.filePath, job.fileName);
  });

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  if (process.env.NODE_ENV === 'production') {
    // Serve production assets
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    // Development mode with Vite dev middleware
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`WorkBuddy Tool server running on port ${PORT}`);
  });
}

startServer();
