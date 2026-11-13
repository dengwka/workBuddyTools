import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Download,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  Cpu,
  ExternalLink,
  ArrowUpCircle,
  Package,
  ShieldCheck,
  Loader2,
  Zap,
} from 'lucide-react';

export const CURRENT_APP_VERSION = '1.2.0';
export const GITHUB_REPO = 'dengwka/workBuddyTools';

export interface GitHubReleaseAsset {
  id: number;
  name: string;
  size: number;
  browser_download_url: string;
  updated_at: string;
}

export interface GitHubReleaseInfo {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  assets: GitHubReleaseAsset[];
}

export type SystemEnvType = 'win-x64' | 'mac-arm64' | 'mac-x64';

export interface DetectedSystemEnv {
  envType: SystemEnvType;
  label: string;
  shortLabel: string;
}

export interface UpdateProgressData {
  percent: number;
  receivedMb: string;
  totalMb: string;
  speedText: string;
  remainingText: string;
  nodeName: string;
}

export function compareSemver(v1: string, v2: string): number {
  const clean1 = (v1 || '').replace(/^v/i, '').trim().split('-')[0];
  const clean2 = (v2 || '').replace(/^v/i, '').trim().split('-')[0];
  const parts1 = clean1.split('.').map((n) => parseInt(n, 10) || 0);
  const parts2 = clean2.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(parts1.length, parts2.length, 3);
  for (let i = 0; i < len; i++) {
    const a = parts1[i] || 0;
    const b = parts2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

export async function detectSystemEnvironment(): Promise<DetectedSystemEnv> {
  const winAny = window as unknown as {
    electronAPI?: {
      platform?: string;
      arch?: string;
      isElectron?: boolean;
      getSystemInfo?: () => Promise<{
        envType?: SystemEnvType;
        summary?: string;
        arch?: string;
        isMac?: boolean;
      }>;
    };
  };

  // 1. Native Rosetta-aware detection via Electron IPC (kuaixuntong scheme)
  if (winAny.electronAPI?.getSystemInfo) {
    try {
      const info = await winAny.electronAPI.getSystemInfo();
      if (info?.envType === 'mac-arm64') {
        return {
          envType: 'mac-arm64',
          label: 'macOS (Apple Silicon M系列芯片 · arm64)',
          shortLabel: 'macOS M芯片 (arm64)',
        };
      }
      if (info?.envType === 'mac-x64') {
        return {
          envType: 'mac-x64',
          label: 'macOS (Intel 处理器 · x64)',
          shortLabel: 'macOS Intel (x64)',
        };
      }
      return {
        envType: 'win-x64',
        label: 'Windows 64位系统 (x64)',
        shortLabel: 'Windows (x64)',
      };
    } catch {
      // fallback
    }
  }

  // 2. Browser high-entropy & WebGL detection fallback
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const isMac = /Macintosh|MacIntel|MacPPC|Mac68K|Mac OS X/i.test(ua) || /Mac/i.test(platform);

  if (isMac) {
    let isArm = false;
    try {
      const uaData = (navigator as any).userAgentData;
      if (uaData && typeof uaData.getHighEntropyValues === 'function') {
        const high = await uaData.getHighEntropyValues(['architecture']);
        if (high?.architecture && /arm/i.test(high.architecture)) {
          isArm = true;
        }
      }
    } catch {
      // ignore
    }

    if (!isArm) {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
          const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
          if (debugInfo) {
            const renderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
            if (/Apple M/i.test(renderer) || (/Apple GPU/i.test(renderer) && !/Intel/i.test(renderer))) {
              isArm = true;
            }
          }
        }
      } catch {
        // ignore
      }
    }

    if (isArm) {
      return {
        envType: 'mac-arm64',
        label: 'macOS (Apple Silicon M系列芯片 · arm64)',
        shortLabel: 'macOS M芯片 (arm64)',
      };
    }

    return {
      envType: 'mac-x64',
      label: 'macOS (Intel 处理器 · x64)',
      shortLabel: 'macOS Intel (x64)',
    };
  }

  return {
    envType: 'win-x64',
    label: 'Windows 64位系统 (x64)',
    shortLabel: 'Windows (x64)',
  };
}

export function findMatchingAsset(
  release: GitHubReleaseInfo | null,
  env: DetectedSystemEnv
): { primaryUrl: string; primaryName: string; primarySizeMb?: string } {
  const versionClean = (release?.tag_name || `v${CURRENT_APP_VERSION}`).replace(/^v/i, '');
  const tag = release?.tag_name || `v${CURRENT_APP_VERSION}`;
  const assets = release?.assets || [];

  let matchedAsset: GitHubReleaseAsset | undefined;

  if (env.envType === 'win-x64') {
    matchedAsset =
      assets.find((a) => a.name.toLowerCase().includes('setup') && a.name.endsWith('.exe')) ||
      assets.find((a) => a.name.endsWith('.exe'));
    const fallbackName = `workbuddyTools-Setup-${versionClean}.exe`;
    return {
      primaryUrl:
        matchedAsset?.browser_download_url ||
        `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${fallbackName}`,
      primaryName: matchedAsset?.name || fallbackName,
      primarySizeMb: matchedAsset ? `${(matchedAsset.size / 1024 / 1024).toFixed(1)} MB` : undefined,
    };
  }

  if (env.envType === 'mac-arm64') {
    matchedAsset =
      assets.find((a) => a.name.endsWith('.dmg') && a.name.includes('arm64')) ||
      assets.find((a) => a.name.endsWith('.zip') && a.name.includes('arm64'));
    const fallbackName = `workbuddyTools-${versionClean}-arm64.dmg`;
    return {
      primaryUrl:
        matchedAsset?.browser_download_url ||
        `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${fallbackName}`,
      primaryName: matchedAsset?.name || fallbackName,
      primarySizeMb: matchedAsset ? `${(matchedAsset.size / 1024 / 1024).toFixed(1)} MB` : undefined,
    };
  }

  matchedAsset =
    assets.find((a) => a.name.endsWith('.dmg') && a.name.includes('x64')) ||
    assets.find((a) => a.name.endsWith('.zip') && a.name.includes('x64'));
  const fallbackName = `workbuddyTools-${versionClean}-x64.dmg`;
  return {
    primaryUrl:
      matchedAsset?.browser_download_url ||
      `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${fallbackName}`,
    primaryName: matchedAsset?.name || fallbackName,
    primarySizeMb: matchedAsset ? `${(matchedAsset.size / 1024 / 1024).toFixed(1)} MB` : undefined,
  };
}

export function triggerExternalDownload(url: string) {
  const winAny = window as unknown as {
    electronAPI?: {
      openExternal?: (targetUrl: string) => Promise<{ ok: boolean }>;
    };
  };
  if (winAny.electronAPI?.openExternal) {
    winAny.electronAPI.openExternal(url);
    return;
  }
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function useVersionUpdater(localVersion: string = CURRENT_APP_VERSION) {
  const [release, setRelease] = useState<GitHubReleaseInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [systemEnv, setSystemEnv] = useState<DetectedSystemEnv>({
    envType: 'win-x64',
    label: 'Windows 64位系统 (x64)',
    shortLabel: 'Windows (x64)',
  });
  const [lastCheckedAt, setLastCheckedAt] = useState<string>('');

  useEffect(() => {
    detectSystemEnvironment().then(setSystemEnv);
  }, []);

  const checkLatestVersion = useCallback(async () => {
    setIsChecking(true);
    try {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (res.ok) {
        const data: GitHubReleaseInfo = await res.json();
        setRelease(data);
        const isNewer = compareSemver(data.tag_name, localVersion) > 0;
        setHasUpdate(isNewer);
        setLastCheckedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
      }
    } catch {
      // ignore offline error
    } finally {
      setIsChecking(false);
    }
  }, [localVersion]);

  useEffect(() => {
    checkLatestVersion();
  }, [checkLatestVersion]);

  return {
    localVersion,
    release,
    isChecking,
    hasUpdate,
    setHasUpdate,
    systemEnv,
    setSystemEnv,
    lastCheckedAt,
    checkLatestVersion,
  };
}

interface VersionUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  localVersion: string;
  release: GitHubReleaseInfo | null;
  hasUpdate: boolean;
  isChecking: boolean;
  systemEnv: DetectedSystemEnv;
  onCheckUpdate: () => void;
  onChangeEnv: (env: DetectedSystemEnv) => void;
}

const ENV_OPTIONS: DetectedSystemEnv[] = [
  {
    envType: 'win-x64',
    label: 'Windows 64位系统 (x64)',
    shortLabel: 'Windows (x64)',
  },
  {
    envType: 'mac-arm64',
    label: 'macOS (Apple Silicon M系列芯片 · arm64)',
    shortLabel: 'macOS M芯片 (arm64)',
  },
  {
    envType: 'mac-x64',
    label: 'macOS (Intel 处理器 · x64)',
    shortLabel: 'macOS Intel (x64)',
  },
];

export const VersionUpdateModal: React.FC<VersionUpdateModalProps> = ({
  isOpen,
  onClose,
  localVersion,
  release,
  hasUpdate,
  isChecking,
  systemEnv,
  onCheckUpdate,
  onChangeEnv,
}) => {
  const [mirrorMode, setMirrorMode] = useState<'auto' | 'ghfast' | 'ghproxy' | 'official'>('auto');
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<UpdateProgressData | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const winAny = window as unknown as {
      electronAPI?: {
        onUpdateProgress?: (cb: (data: UpdateProgressData) => void) => () => void;
      };
    };
    if (winAny.electronAPI?.onUpdateProgress) {
      const unsubscribe = winAny.electronAPI.onUpdateProgress((data) => {
        setProgress(data);
      });
      return unsubscribe;
    }
  }, []);

  if (!isOpen) return null;

  const remoteTag = release?.tag_name || `v${localVersion}`;
  const matched = findMatchingAsset(release, systemEnv);

  const defaultReleaseNotes =
    release?.body?.trim() ||
    `### v${localVersion} 更新说明\n- 采用 kuaixuntong 同款无自签名污染 NSIS 打包与流式直装方案，避免浏览器下载标记导致 SmartScreen 蓝框拦截\n- 新增 13 项成长中心任务自动触发与快捷完成助手\n- 每完成一项任务实时调用官方接口刷新最新积分\n- 底部日志控制台默认收起并支持鼠标上下拖拽调节高度，消除底部按钮换行`;

  const handleSmartDownload = async () => {
    setStatusMessage(null);
    const winAny = window as unknown as {
      electronAPI?: {
        isElectron?: boolean;
        downloadAndInstallUpdate?: (payload: {
          downloadUrl: string;
          mirrorMode: string;
        }) => Promise<{ success: boolean; filePath?: string; nodeName?: string; error?: string }>;
      };
    };

    // In Electron Desktop App: use kuaixuntong's Node.js stream download + shell.openPath (no browser Zone.Identifier!)
    if (winAny.electronAPI?.isElectron && typeof winAny.electronAPI.downloadAndInstallUpdate === 'function') {
      setIsDownloading(true);
      setProgress({
        percent: 0,
        receivedMb: '0.0',
        totalMb: '0.0',
        speedText: '正在连接高速节点...',
        remainingText: '',
        nodeName: '智能加速引擎',
      });
      try {
        const res = await winAny.electronAPI.downloadAndInstallUpdate({
          downloadUrl: matched.primaryUrl,
          mirrorMode,
        });
        if (res.success) {
          setStatusMessage({
            ok: true,
            text: `安装包已通过 [${res.nodeName}] 下载完成并自动拉起安装向导！（无浏览器联网标记，免拦截直装）`,
          });
        } else {
          triggerExternalDownload(matched.primaryUrl);
          setStatusMessage({
            ok: true,
            text: `已切换至系统浏览器下载：${matched.primaryName}`,
          });
        }
      } catch {
        triggerExternalDownload(matched.primaryUrl);
      } finally {
        setIsDownloading(false);
      }
      return;
    }

    // In Web Browser: use selected CDN mirror or direct GitHub URL
    let finalUrl = matched.primaryUrl;
    if (mirrorMode === 'ghfast' || mirrorMode === 'auto') {
      finalUrl = `https://ghfast.top/${matched.primaryUrl}`;
    } else if (mirrorMode === 'ghproxy') {
      finalUrl = `https://gh-proxy.com/${matched.primaryUrl}`;
    }
    triggerExternalDownload(finalUrl);
    setStatusMessage({
      ok: true,
      text: `已开始自动下载对应系统安装包：${matched.primaryName}`,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/90">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20 relative">
              <ArrowUpCircle className="w-5 h-5" />
              {hasUpdate && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-slate-950 animate-pulse" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-100 text-sm">版本升级管理</h3>
                {hasUpdate ? (
                  <span className="px-2 py-0.5 text-[10px] font-medium bg-rose-500/15 text-rose-300 border border-rose-500/30 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                    发现新版本 {remoteTag}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
                    当前已是最新
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">内置多源 CDN 加速流式下载与自动启动安装（免浏览器安全拦截）</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3.5 overflow-y-auto text-xs">
          {/* Version Comparison Strip */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between">
              <div>
                <div className="text-[11px] text-slate-400">本地当前版本</div>
                <div className="text-sm font-bold font-mono text-slate-200 mt-0.5">v{localVersion}</div>
              </div>
              <Package className="w-5 h-5 text-slate-500" />
            </div>

            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between">
              <div>
                <div className="text-[11px] text-slate-400">GitHub 最新版本</div>
                <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5 flex items-center gap-1.5">
                  <span>{remoteTag}</span>
                  {hasUpdate && <span className="w-2 h-2 rounded-full bg-rose-500" />}
                </div>
              </div>
              <button
                type="button"
                onClick={onCheckUpdate}
                disabled={isChecking}
                title="立即检查 GitHub 最新版本"
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin text-emerald-400' : ''}`} />
              </button>
            </div>
          </div>

          {/* Detected OS & Architecture Box */}
          <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-300 font-medium">
                <Cpu className="w-4 h-4 text-emerald-400" />
                <span>已自动识别系统环境：{systemEnv.label}</span>
              </div>
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            </div>

            <div className="flex items-center justify-between gap-2 pt-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-400">目标环境:</span>
                {ENV_OPTIONS.map((opt) => (
                  <button
                    key={opt.envType}
                    type="button"
                    onClick={() => onChangeEnv(opt)}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer ${
                      systemEnv.envType === opt.envType
                        ? 'bg-emerald-600 text-white font-semibold'
                        : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-700/70'
                    }`}
                  >
                    {opt.shortLabel}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Mirror Acceleration Node Selector (from kuaixuntong) */}
          <div className="flex items-center justify-between px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl">
            <span className="text-slate-300 flex items-center gap-1.5 text-[11px]">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>下载加速源:</span>
            </span>
            <select
              value={mirrorMode}
              onChange={(e) => setMirrorMode(e.target.value as any)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="auto">⚡ 智能多源自动切换 (推荐)</option>
              <option value="ghfast">⚡ GHFast 国内高速镜像</option>
              <option value="ghproxy">🚀 GH-Proxy 备用镜像</option>
              <option value="official">🌐 GitHub 官方源 (直连)</option>
            </select>
          </div>

          {/* GitHub Release Notes */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-slate-300 font-medium">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>GitHub 版本升级文案 ({remoteTag})</span>
              </span>
              {release?.published_at && (
                <span className="text-[11px] text-slate-500 font-mono">
                  发布于 {new Date(release.published_at).toLocaleString('zh-CN')}
                </span>
              )}
            </div>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 font-mono text-[11px] leading-relaxed whitespace-pre-wrap max-h-36 overflow-y-auto select-text">
              {defaultReleaseNotes}
            </div>
          </div>

          {/* Stream Download Progress Bar */}
          {isDownloading && progress && (
            <div className="p-3 bg-slate-950 border border-emerald-500/30 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-emerald-400">{progress.nodeName}</span>
                <span className="text-slate-300">
                  {progress.percent}% ({progress.receivedMb}/{progress.totalMb} MB) · {progress.speedText}{' '}
                  {progress.remainingText}
                </span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-200"
                  style={{ width: `${Math.max(2, progress.percent)}%` }}
                />
              </div>
            </div>
          )}

          {/* Status Message */}
          {statusMessage && (
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-[11px] leading-relaxed">{statusMessage.text}</span>
            </div>
          )}

          {/* Primary Download & Install Button */}
          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={handleSmartDownload}
              disabled={isDownloading}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isDownloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>
                {isDownloading
                  ? '正在流式下载安装包并准备自动启动...'
                  : `${hasUpdate ? '立即更新并自动下载安装包' : '下载当前系统安装包'} (${matched.primaryName}${
                      matched.primarySizeMb ? ` · ${matched.primarySizeMb}` : ''
                    })`}
              </span>
            </button>

            <div className="flex items-center justify-between px-1 text-[11px] text-slate-400">
              <button
                type="button"
                onClick={() => triggerExternalDownload(matched.primaryUrl)}
                className="text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
              >
                通过浏览器直接下载 ({matched.primaryName})
              </button>

              <a
                href={`https://github.com/${GITHUB_REPO}/releases`}
                target="_blank"
                rel="noreferrer"
                className="text-slate-400 hover:text-slate-200 inline-flex items-center gap-1"
              >
                <span>查看全部 GitHub Releases</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
