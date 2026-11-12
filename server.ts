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

  // API Proxy Route for WorkBuddy to bypass browser CORS
  app.post('/api/workbuddy/proxy', async (req: Request, res: Response) => {
    try {
      const { url, method = 'GET', headers = {}, body } = req.body;

      if (!url || !url.startsWith('https://www.workbuddy.cn')) {
        return res.status(400).json({ error: 'Invalid or disallowed WorkBuddy URL' });
      }

      const requestHeaders: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 WorkBuddy/0.5.9',
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'X-Client-Platform': 'web',
        ...headers,
      };

      const fetchOptions: RequestInit = {
        method,
        headers: requestHeaders,
      };

      if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
      }

      const wbResponse = await fetch(url, fetchOptions);
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
