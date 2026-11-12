import React, { useState } from 'react';
import {
  Wrench,
  Github,
  Code2,
  HelpCircle,
  Download,
  Sparkles,
  Terminal,
  ExternalLink,
  MessageSquarePlus,
  CheckCircle2,
  Copy,
  Check,
} from 'lucide-react';
import { GitHubSyncPanel } from './components/GitHubSyncPanel';
import { ToolPlayground } from './components/ToolPlayground';
import { CodeViewer } from './components/CodeViewer';
import { TokenGuideModal } from './components/TokenGuideModal';
import { downloadProjectZip } from './utils/projectFiles';

export default function App() {
  const [activeTab, setActiveTab] = useState<'tools' | 'sync' | 'code'>('sync');
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);

  const handleSelectPromptTemplate = (prompt: string) => {
    navigator.clipboard.writeText(prompt);
    setCopiedNotification(prompt);
    setTimeout(() => setCopiedNotification(null), 5000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <Github className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-base tracking-tight">DevTool &amp; GitHub Sync</span>
                <span className="text-[10px] uppercase font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                  v1.0 Ready
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                定制你的专属小工具，写完后自动推送上传到你的 GitHub
              </p>
            </div>
          </div>

          {/* Center Tabs */}
          <nav className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('sync')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                activeTab === 'sync'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Github className="w-3.5 h-3.5" />
              <span>GitHub 自动上传</span>
            </button>
            <button
              onClick={() => setActiveTab('tools')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                activeTab === 'tools'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>小工具工作区</span>
            </button>
            <button
              onClick={() => setActiveTab('code')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                activeTab === 'code'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>源码清单</span>
            </button>
          </nav>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsGuideOpen(true)}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium rounded-lg border border-slate-700/80 flex items-center gap-1.5 transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden md:inline">配置指引</span>
            </button>
            <button
              onClick={() => downloadProjectZip()}
              className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-medium rounded-lg border border-indigo-500/30 flex items-center gap-1.5 transition-colors"
              title="打包下载源码 ZIP"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden md:inline">下载 ZIP</span>
            </button>
          </div>
        </div>
      </header>

      {/* Copied Notification Toast */}
      {copiedNotification && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md bg-slate-900 border border-indigo-500/40 rounded-2xl p-4 shadow-2xl flex items-start gap-3 animate-bounce-short">
          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="flex-1 text-xs">
            <div className="font-semibold text-slate-100">已复制需求模版！</div>
            <p className="text-slate-400 mt-1 line-clamp-2">{copiedNotification}</p>
            <div className="mt-2 text-indigo-300 font-medium">
              👉 请在对话中直接发送给我，我将立即为你把整套工具编写上线并准备推送！
            </div>
          </div>
        </div>
      )}

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Quick Answer Banner */}
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20 mt-0.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                回答你的问题：自动上传到 GitHub 需要提供什么？
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                只需提供 2 样信息：<strong className="text-white">① 你的 GitHub 仓库地址</strong>（例如 <code className="bg-slate-950 px-1 py-0.5 rounded text-amber-300">https://github.com/username/my-tool</code>）和 <strong className="text-white">② 具有 repo 权限的 GitHub Token (PAT)</strong>。你可以发在聊天中由我自动 push，也可以在下方输入框一键直传！
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setActiveTab('sync')}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-xl transition-colors"
            >
              立即配置上传
            </button>
            <button
              onClick={() => setActiveTab('tools')}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 transition-colors"
            >
              浏览小工具
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'sync' && <GitHubSyncPanel onOpenGuide={() => setIsGuideOpen(true)} />}
        {activeTab === 'tools' && <ToolPlayground onSelectPromptTemplate={handleSelectPromptTemplate} />}
        {activeTab === 'code' && <CodeViewer />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Google AI Studio • DevTool Workspace with GitHub Auto-Sync</span>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsGuideOpen(true)}
              className="hover:text-slate-300 transition-colors"
            >
              Token 获取指南
            </button>
            <a
              href="https://github.com/settings/tokens"
              target="_blank"
              rel="noreferrer"
              className="hover:text-slate-300 inline-flex items-center gap-1 transition-colors"
            >
              <span>GitHub Developer Settings</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </footer>

      {/* Token Guide Modal */}
      <TokenGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </div>
  );
}
