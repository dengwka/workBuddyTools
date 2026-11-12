import React from 'react';
import { X, ExternalLink, ShieldCheck, KeyRound, CheckCircle2, AlertTriangle, Copy, Check } from 'lucide-react';

interface TokenGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TokenGuideModal: React.FC<TokenGuideModalProps> = ({ isOpen, onClose }) => {
  const [copiedLink, setCopiedLink] = React.useState(false);

  if (!isOpen) return null;

  const tokenUrl = 'https://github.com/settings/tokens/new?scopes=repo&description=AI_Studio_DevTool_AutoSync';

  const copyUrl = () => {
    navigator.clipboard.writeText(tokenUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-lg">如何获取 GitHub 访问令牌 (Token)？</h3>
              <p className="text-xs text-slate-400">仅需 3 步，赋予代码自动推送与创建仓库权限</p>
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
        <div className="p-6 space-y-6 overflow-y-auto text-sm">
          {/* Quick link banner */}
          <div className="bg-gradient-to-r from-indigo-950/60 to-purple-950/40 border border-indigo-700/40 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="font-medium text-indigo-200 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>快速一键直达生成页（已自动勾选权限）</span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                点击右侧按钮直接打开 GitHub 创建 Token 页面，无需手动翻找菜单
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={copyUrl}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>复制链接</span>
              </button>
              <a
                href={tokenUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
              >
                <span>打开 GitHub</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-4">
            <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-slate-800/40 border border-slate-800">
              <div className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-400 font-bold flex items-center justify-center shrink-0 text-sm">
                1
              </div>
              <div>
                <h4 className="font-semibold text-slate-200">进入 GitHub Token 设置</h4>
                <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                  登录 GitHub &rarr; 点击右上角个人头像 &rarr; <span className="text-indigo-300 font-mono">Settings</span> &rarr; 左侧最底部的 <span className="text-indigo-300 font-mono">Developer settings</span> &rarr; <span className="text-indigo-300 font-mono">Personal access tokens</span> &rarr; 选择 <span className="text-indigo-300 font-mono">Tokens (classic)</span>。
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-slate-800/40 border border-slate-800">
              <div className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-400 font-bold flex items-center justify-center shrink-0 text-sm">
                2
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-slate-200">选择所需权限范围 (Scopes)</h4>
                <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                  在 Note 输入框填写一个名称（如 <code className="bg-slate-900 px-1 py-0.5 rounded text-amber-300">AI-Studio-Sync</code>），并勾选：
                </p>
                <div className="mt-2.5 p-2.5 bg-slate-950/80 rounded-lg border border-slate-800 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>[必须] 勾选 <code className="font-bold text-emerald-300">repo</code> (Full control of private repositories)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 pl-6">
                    如果仅推送公开仓库，只需勾选 <code className="text-slate-300">public_repo</code>。
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-slate-800/40 border border-slate-800">
              <div className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-400 font-bold flex items-center justify-center shrink-0 text-sm">
                3
              </div>
              <div>
                <h4 className="font-semibold text-slate-200">生成并复制 Token</h4>
                <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                  滑到页面底部点击绿色按钮 <span className="text-emerald-400 font-semibold">Generate token</span>。请立即复制以 <code className="text-amber-300">ghp_...</code> 开头的 Token 字符串（刷新后将无法再次查看）。
                </p>
              </div>
            </div>
          </div>

          {/* Security notice */}
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2.5 text-xs text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-medium text-amber-300">安全性提示：</span>
              <p className="text-slate-300 text-[11px] mt-0.5">
                Token 仅保存在你的浏览器本地，用于调用 GitHub API 推送代码。或者在对话中发送给 AI 助手，AI 助手在容器终端执行推送后不会持久化存储。用完随时可以在 GitHub 撤销 (Revoke)。
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-950/70 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors"
          >
            我知道了，返回
          </button>
        </div>
      </div>
    </div>
  );
};
