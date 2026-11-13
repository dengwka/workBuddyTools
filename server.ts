import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
