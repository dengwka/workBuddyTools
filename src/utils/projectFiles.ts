import JSZip from 'jszip';
import { ProjectFile } from '../types';

export const CURRENT_PROJECT_FILES: ProjectFile[] = [
  {
    path: 'package.json',
    language: 'json',
    content: `{
  "name": "devtool-workspace",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port=3000 --host=0.0.0.0",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@tailwindcss/vite": "^4.3.3",
    "@vitejs/plugin-react": "^6.1.1",
    "lucide-react": "^0.546.0",
    "motion": "^12.23.24",
    "react": "^19.0.1",
    "react-dom": "^19.0.1",
    "vite": "^8.3.0",
    "jszip": "^3.10.1",
    "tailwindcss": "^4.3.3"
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
    path: 'index.html',
    language: 'html',
    content: `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DevTool & GitHub Sync</title>
    <meta name="description" content="Build custom mini-tools and automatically sync or push project code to your GitHub repository." />
  </head>
  <body class="bg-slate-900 text-slate-100 min-h-screen">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
  },
  {
    path: 'vite.config.ts',
    language: 'typescript',
    content: `import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
});`,
  },
  {
    path: 'tsconfig.json',
    language: 'json',
    content: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "types": ["vite/client"],
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "jsx": "react-jsx",
    "paths": {
      "@/*": ["./*"]
    },
    "noEmit": true
  },
  "exclude": ["dist", "node_modules"]
}`,
  },
  {
    path: '.gitignore',
    language: 'plaintext',
    content: `node_modules/
dist/
.DS_Store
*.log
.env*
!.env.example`,
  },
  {
    path: 'README.md',
    language: 'markdown',
    content: `# DevTool & GitHub Auto-Sync

Created with Google AI Studio.

## 🚀 Quick Start

\`\`\`bash
# 1. 安装依赖
npm install

# 2. 启动本地开发服务
npm run dev

# 3. 生产打包
npm run build
\`\`\`

## 📦 Features
- ⚡ 实时交互式小工具定制
- 🔄 GitHub API 一键直传推送 / Git 终端自动提交
- 📂 项目代码在线浏览与 ZIP 打包下载
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
    font-feature-settings: "cv02", "cv03", "cv04", "cv11";
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
  a.download = `my-devtool-project-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
