import JSZip from 'jszip';
import { ProjectFile } from '../types';

export const CURRENT_PROJECT_FILES: ProjectFile[] = [
  {
    path: 'package.json',
    language: 'json',
    content: `{
  "name": "workbuddy-tools",
  "private": true,
  "version": "0.5.9",
  "type": "module",
  "main": "electron/main.cjs",
  "scripts": {
    "dev": "vite --port=3000 --host=0.0.0.0",
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
    "jszip": "^3.10.2",
    "lucide-react": "^0.546.0",
    "motion": "^12.23.24",
    "react": "^19.0.1",
    "react-dom": "^19.0.1",
    "tailwindcss": "^4.3.3",
    "vite": "^8.3.0"
  },
  "devDependencies": {
    "@types/node": "^22.14.0",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "typescript": "^7.0.2"
  }
}`,
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
    title: 'WorkBuddy 账号日常工具 v0.5.9',
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
  appVersion: '0.5.9',
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
    path: 'index.html',
    language: 'html',
    content: `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>WorkBuddy 账号日常工具 v0.5.9</title>
    <meta name="description" content="WorkBuddy 账号日常工具 - 支持多账号管理、日常自动化任务、猫猫旅行与 Windows EXE 打包" />
  </head>
  <body class="bg-slate-950 text-slate-100 min-h-screen">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
  },
  {
    path: 'README.md',
    language: 'markdown',
    content: `# WorkBuddy 账号日常工具 (workbuddyTools)

> 账号日常自动化工具 v0.5.9，支持本地浏览器访问与打包为 Windows EXE 桌面端。

## 🌟 特性
- 👥 **多账号集中管理**：支持国内版 / 国际版，支持 Cookie / Token 授权认证与代理设置
- 🐱 **猫猫旅行自动化**：支持自动旅行启程、状态同步与积分奖励结算
- ⚡ **一键执行日常**：一键自动化完成 WorkBuddy 推荐模板、AI 聊天、专家召唤、签到打卡并自动领奖
- 🖥️ **双端就绪**：
  - 本地浏览器运行：\`npm run dev\` 极速启动
  - Windows EXE 桌面客户端：\`npm run build:exe\` 一键生成安装包与免安装便携版

## 🚀 本地开发与启动

\`\`\`bash
# 1. 安装依赖
npm install

# 2. 启动本地浏览器服务 (端口 3000)
npm run dev
\`\`\`

## 📦 打包为 Windows EXE 桌面端

\`\`\`bash
# 1. 安装 Electron 构建工具
npm install -D electron electron-builder

# 2. 执行编译与打包
npm run build:exe

# 输出可执行文件在 release/ 目录下:
# - release/WorkBuddy 账号日常工具 Setup 0.5.9.exe (标准安装包)
# - release/WorkBuddy 账号日常工具 0.5.9.exe (绿色便携版)
\`\`\`
`,
  },
  {
    path: 'src/main.tsx',
    language: 'typescript',
    content: `import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);`,
  },
  {
    path: 'src/index.css',
    language: 'css',
    content: `@import "tailwindcss";

@layer base {
  body {
    background-color: #0b0f19;
    color: #f1f5f9;
  }
}`,
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
  a.download = `workbuddyTools-v0.5.9.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
