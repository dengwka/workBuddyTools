import JSZip from 'jszip';
import { ProjectFile } from '../types';

export const CURRENT_PROJECT_FILES: ProjectFile[] = [
  {
    path: 'package.json',
    language: 'json',
    content: `{
  "name": "workbuddy-tools",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "main": "electron/main.cjs",
  "scripts": {
    "dev": "tsx server.ts",
    "start": "tsx server.ts",
    "build": "vite build",
    "preview": "vite preview",
    "clean": "rm -rf dist server.js",
    "lint": "tsc --noEmit",
    "electron:dev": "vite",
    "build:exe": "vite build && electron-builder --win --x64"
  },
  "dependencies": {
    "@tailwindcss/vite": "^4.3.3",
    "@vitejs/plugin-react": "^6.1.1",
    "express": "^4.21.2",
    "jszip": "^3.10.2",
    "lucide-react": "^0.546.0",
    "motion": "^12.23.24",
    "react": "^19.0.1",
    "react-dom": "^19.0.1",
    "tailwindcss": "^4.3.3",
    "vite": "^8.3.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^22.14.0",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "tsx": "^4.21.0",
    "typescript": "^7.0.2"
  }
}`,
  },
  {
    path: 'server.ts',
    language: 'typescript',
    content: `import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

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
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 WorkBuddy/1.0.0',
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

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(\`WorkBuddy Tool server running on port \${PORT}\`);
  });
}

startServer();`,
  },
  {
    path: '.github/workflows/build.yml',
    language: 'yaml',
    content: `name: Build and Release Windows EXE

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:
    inputs:
      version:
        description: 'Release Version'
        required: false
        default: 'v1.0.0'

permissions:
  contents: write

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - name: Install Dependencies
        run: npm ci || npm install
      - name: Build Web Dist
        run: npm run build
      - name: Package Windows Desktop App (.exe)
        run: npx electron-builder --win --x64
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
      - name: Publish GitHub Release
        uses: softprops/action-gh-release@v2
        if: startsWith(github.ref, 'refs/tags/') || github.event_name == 'workflow_dispatch'
        with:
          tag_name: \${{ github.ref_name || inputs.version || 'v1.0.0' }}
          name: WorkBuddy 账号日常工具 \${{ github.ref_name || inputs.version || 'v1.0.0' }}
          files: release/*.exe
          draft: false
          prerelease: false`,
  },
  {
    path: 'electron/main.cjs',
    language: 'javascript',
    content: `const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 700,
    title: 'WorkBuddy 账号日常工具 v1.0.0',
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev && process.env.ELECTRON_DEV_URL) {
    win.loadURL(process.env.ELECTRON_DEV_URL);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});`,
  },
  {
    path: 'electron/preload.cjs',
    language: 'javascript',
    content: `const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  appVersion: '1.0.0',
});`,
  },
  {
    path: 'electron-builder.json',
    language: 'json',
    content: `{
  "appId": "com.workbuddy.tools",
  "productName": "WorkBuddy 账号日常工具",
  "directories": {
    "output": "release"
  },
  "files": [
    "dist/**/*",
    "electron/**/*",
    "package.json"
  ],
  "win": {
    "target": [
      {
        "target": "nsis",
        "arch": ["x64"]
      },
      {
        "target": "portable",
        "arch": ["x64"]
      }
    ]
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true,
    "shortcutName": "WorkBuddy 账号日常工具"
  }
}`,
  },
  {
    path: 'README.md',
    language: 'markdown',
    content: `# WorkBuddy 账号日常工具 (workbuddyTools v1.0.0)

> 真实对接官方成长中心与猫猫旅行 API，支持多账号一键日常自动化与 Windows EXE 桌面客户端。

## 🌟 核心功能
- ⚡ **真实官方接口同步**：直连 \`https://www.workbuddy.cn\` 官方成长中心，真实同步成长任务进度、自动激活接取、自动领奖并增加积分
- 🐱 **猫猫旅行自动化**：自动检测猫猫状态、出发旅行并一键领取旅行收益
- 👥 **多账号集中管理**：支持快速添加/切换多个账号，支持 Cookie 与 Token 认证
- 🖥️ **本地浏览器 + Windows EXE**：
  - 本地浏览器运行：\`npm run dev\`
  - GitHub 云端自动打包 EXE：推送 tag 或在 Actions 中一键运行构建
`,
  },
];

export async function downloadProjectZip(customFiles?: ProjectFile[]): Promise<void> {
  const filesToZip = customFiles && customFiles.length > 0 ? customFiles : CURRENT_PROJECT_FILES;
  const zip = new JSZip();

  for (const file of filesToZip) {
    zip.file(file.path, file.content);
  }

  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = `workbuddyTools-v1.0.0.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
