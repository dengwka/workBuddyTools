import React, { useState } from 'react';
import {
  Monitor,
  Github,
  Code2,
  Download,
  CheckCircle2,
  ExternalLink,
  PackageCheck,
  ShieldCheck,
  FolderGit2,
} from 'lucide-react';
import { WorkBuddyWorkspace } from './components/WorkBuddyWorkspace';
import { GitHubSyncPanel } from './components/GitHubSyncPanel';
import { CodeViewer } from './components/CodeViewer';
import { ElectronPackageGuide } from './components/ElectronPackageGuide';
import { downloadProjectZip } from './utils/projectFiles';

export default function App() {
  const [activeTab, setActiveTab] = useState<'workspace' | 'github' | 'code'>('workspace');
  const [isPackagingGuideOpen, setIsPackagingGuideOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadProjectZip();
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Top Application Bar */}
      <header className="sticky top-0 z-40 bg-slate-950/85 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-15 flex items-center justify-between gap-4">
          {/* Brand & Wordmark */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white font-bold font-mono text-sm shadow-md shadow-emerald-950/40">
              W
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-100 text-sm tracking-tight">WorkBuddy 账号日常工具</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">
                  v1.0.0
                </span>
                <span className="text-[10px] text-slate-500 hidden sm:inline">
                  (workbuddyTools)
                </span>
              </div>
            </div>
          </div>

          {/* Center View Switcher */}
          <nav className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('workspace')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'workspace'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>日常工作台</span>
            </button>

            <button
              onClick={() => setActiveTab('github')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'github'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Github className="w-3.5 h-3.5" />
              <span>GitHub 仓库同步</span>
            </button>

            <button
              onClick={() => setActiveTab('code')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'code'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>源码清单</span>
            </button>
          </nav>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPackagingGuideOpen(true)}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium rounded-lg border border-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <PackageCheck className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">打包 Windows EXE</span>
            </button>

            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden md:inline">下载 ZIP</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* GitHub Target Repo Badge Strip */}
        <div className="p-3 bg-slate-900/60 border border-slate-800/90 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
              <FolderGit2 className="w-4 h-4" />
            </div>
            <div>
              <span className="text-slate-400">目标 GitHub 仓库:</span>
              <a
                href="https://github.com/dengwka/workBuddyTools"
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 hover:underline font-mono font-medium ml-1.5 inline-flex items-center gap-1"
              >
                <span>dengwka/workBuddyTools</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          <div className="flex items-center gap-3 text-slate-400">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Token 已配置</span>
            </span>
            <span>•</span>
            <span className="text-slate-300">支持本地浏览器 / Windows EXE 双运行模式</span>
          </div>
        </div>

        {/* Dynamic Tab Views */}
        {activeTab === 'workspace' && (
          <WorkBuddyWorkspace
            onOpenPackagingGuide={() => setIsPackagingGuideOpen(true)}
            onOpenGitHubSync={() => setActiveTab('github')}
          />
        )}

        {activeTab === 'github' && (
          <GitHubSyncPanel onOpenGuide={() => setIsPackagingGuideOpen(true)} />
        )}

        {activeTab === 'code' && <CodeViewer />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>WorkBuddy 账号日常工具 v1.0.0 • workbuddyTools</span>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsPackagingGuideOpen(true)}
              className="hover:text-slate-300 transition-colors cursor-pointer"
            >
              EXE 打包说明
            </button>
            <a
              href="https://github.com/dengwka/workBuddyTools"
              target="_blank"
              rel="noreferrer"
              className="hover:text-slate-300 inline-flex items-center gap-1 transition-colors"
            >
              <span>GitHub 仓库</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </footer>

      {/* Packaging Guide Modal */}
      <ElectronPackageGuide
        isOpen={isPackagingGuideOpen}
        onClose={() => setIsPackagingGuideOpen(false)}
      />
    </div>
  );
}
