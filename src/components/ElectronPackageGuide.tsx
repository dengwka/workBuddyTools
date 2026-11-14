import React, { useState } from 'react';
import { X, Monitor, Terminal, Download, Check, Copy, Package, ShieldCheck } from 'lucide-react';
import { downloadProjectZip } from '../utils/projectFiles';

interface ElectronPackageGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ElectronPackageGuide: React.FC<ElectronPackageGuideProps> = ({ isOpen, onClose }) => {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  if (!isOpen) return null;

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadProjectZip();
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-sm">本地启动与 Windows EXE 桌面端打包指南</h3>
              <p className="text-xs text-slate-400">已内置完整 Electron 与 electron-builder 生产配置</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto text-xs text-slate-300">
          {/* Option 1: Browser local run */}
          <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-200 font-semibold text-xs">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-[11px]">
                  1
                </span>
                <span>在本地电脑使用浏览器访问启动</span>
              </div>
              <button
                onClick={() => copyText('git clone https://github.com/dengwka/workBuddyTools.git\ncd workBuddyTools\nnpm install\nnpm run dev', 'web')}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
              >
                {copiedCmd === 'web' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>复制代码</span>
              </button>
            </div>
            <pre className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 font-mono text-[11px] text-emerald-400 overflow-x-auto whitespace-pre">
{`# 1. 克隆或解压项目
git clone https://github.com/dengwka/workBuddyTools.git
cd workBuddyTools

# 2. 安装依赖并启动
npm install
npm run dev

# 浏览器自动打开 http://localhost:3000 即可使用`}
            </pre>
          </div>

          {/* Option 2: Electron exe packaging */}
          <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-200 font-semibold text-xs">
                <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 font-bold flex items-center justify-center text-[11px]">
                  2
                </span>
                <span>一键打包为 Windows EXE / macOS (Intel & M芯片) 桌面客户端</span>
              </div>
              <button
                onClick={() => copyText('npm install -D electron electron-builder\nnpm run build:exe\n# macOS:\nnpm run build:mac', 'exe')}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
              >
                {copiedCmd === 'exe' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>复制代码</span>
              </button>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              项目内已包含 <code className="text-indigo-300">electron/main.cjs</code>（内置原生 IPC 代理直连工作台）、<code className="text-indigo-300">electron/preload.cjs</code> 与 <code className="text-indigo-300">electron-builder.json</code>。执行：
            </p>
            <pre className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 font-mono text-[11px] text-indigo-300 overflow-x-auto whitespace-pre">
{`# 1. 安装打包工具（仅需一次）
npm install --legacy-peer-deps -D electron electron-builder

# 2. 打包 Windows 安装包 & 便携式 exe
npm run build:exe

# 3. 打包 macOS Intel (x64) + Apple Silicon M芯片 (arm64)
npm run build:mac

# 输出产物位于 release/ 目录:
# - workbuddyTools-Setup-1.0.1.exe
# - workbuddyTools-1.0.1-x64.dmg (Intel)
# - workbuddyTools-1.0.1-arm64.dmg (M芯片)`}
            </pre>
          </div>

          {/* Download full ZIP button */}
          <div className="flex items-center justify-between p-3.5 bg-emerald-950/30 border border-emerald-800/40 rounded-xl">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-emerald-300">也可以直接下载完整源码压缩包到本地电脑</span>
            </div>
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>下载全部源码 ZIP</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950/80 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
