import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Download,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  Cpu,
  Monitor,
  ExternalLink,
  ArrowUpCircle,
  Package,
  ShieldCheck,
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
  recommendedSuffix: string;
  backupSuffix: string;
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
    };
  };

  // 1. Exact native detection inside Electron desktop runtime
  if (winAny.electronAPI?.platform) {
    const p = winAny.electronAPI.platform;
    const arch = winAny.electronAPI.arch || 'x64';
    if (p === 'darwin') {
      if (arch === 'arm64') {
        return {
          envType: 'mac-arm64',
          label: 'macOS (Apple Silicon M系列芯片 · arm64)',
          shortLabel: 'macOS M芯片 (arm64)',
          recommendedSuffix: 'mac-arm64.dmg',
          backupSuffix: 'mac-arm64.zip',
        };
      }
      return {
        envType: 'mac-x64',
        label: 'macOS (Intel 处理器 · x64)',
        shortLabel: 'macOS Intel (x64)',
        recommendedSuffix: 'mac-x64.dmg',
        backupSuffix: 'mac-x64.zip',
      };
    }
    return {
      envType: 'win-x64',
      label: 'Windows 64位系统 (x64)',
      shortLabel: 'Windows (x64)',
      recommendedSuffix: 'win-x64-setup.exe',
      backupSuffix: 'win-x64-portable.exe',
    };
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
        recommendedSuffix: 'mac-arm64.dmg',
        backupSuffix: 'mac-arm64.zip',
      };
    }

    return {
      envType: 'mac-x64',
      label: 'macOS (Intel 处理器 · x64)',
      shortLabel: 'macOS Intel (x64)',
      recommendedSuffix: 'mac-x64.dmg',
      backupSuffix: 'mac-x64.zip',
    };
  }

  return {
    envType: 'win-x64',
    label: 'Windows 64位系统 (x64)',
    shortLabel: 'Windows (x64)',
    recommendedSuffix: 'win-x64-setup.exe',
    backupSuffix: 'win-x64-portable.exe',
  };
}

export function findMatchingAsset(
  release: GitHubReleaseInfo | null,
  env: DetectedSystemEnv
): { primaryUrl: string; primaryName: string; primarySizeMb?: string; backupUrl?: string; backupName?: string } {
  const versionClean = (release?.tag_name || `v${CURRENT_APP_VERSION}`).replace(/^v/i, '');
  const tag = release?.tag_name || `v${CURRENT_APP_VERSION}`;
  const assets = release?.assets || [];

  // Match from real GitHub Release assets list first
  const primaryAsset = assets.find((a) => a.name.toLowerCase().endsWith(env.recommendedSuffix.toLowerCase()));
  const backupAsset = assets.find((a) => a.name.toLowerCase().endsWith(env.backupSuffix.toLowerCase()));

  const fallbackPrimaryName = `workbuddyTools-${versionClean}-${env.recommendedSuffix}`;
  const fallbackPrimaryUrl = `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${fallbackPrimaryName}`;

  const fallbackBackupName = `workbuddyTools-${versionClean}-${env.backupSuffix}`;
  const fallbackBackupUrl = `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${fallbackBackupName}`;

  return {
    primaryUrl: primaryAsset?.browser_download_url || fallbackPrimaryUrl,
    primaryName: primaryAsset?.name || fallbackPrimaryName,
    primarySizeMb: primaryAsset ? `${(primaryAsset.size / 1024 / 1024).toFixed(1)} MB` : undefined,
    backupUrl: backupAsset?.browser_download_url || fallbackBackupUrl,
    backupName: backupAsset?.name || fallbackBackupName,
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
    recommendedSuffix: 'win-x64-setup.exe',
    backupSuffix: 'win-x64-portable.exe',
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
    recommendedSuffix: 'win-x64-setup.exe',
    backupSuffix: 'win-x64-portable.exe',
  },
  {
    envType: 'mac-arm64',
    label: 'macOS (Apple Silicon M系列芯片 · arm64)',
    shortLabel: 'macOS M芯片 (arm64)',
    recommendedSuffix: 'mac-arm64.dmg',
    backupSuffix: 'mac-arm64.zip',
  },
  {
    envType: 'mac-x64',
    label: 'macOS (Intel 处理器 · x64)',
    shortLabel: 'macOS Intel (x64)',
    recommendedSuffix: 'mac-x64.dmg',
    backupSuffix: 'mac-x64.zip',
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
  const [downloadTriggered, setDownloadTriggered] = useState<string | null>(null);

  if (!isOpen) return null;

  const remoteTag = release?.tag_name || `v${localVersion}`;
  const matched = findMatchingAsset(release, systemEnv);

  const defaultReleaseNotes =
    release?.body?.trim() ||
    `### v${localVersion} 更新说明\n- 新增 13 项成长中心任务自动执行与半自动快捷完成助手\n- 每完成一项任务实时调用官方接口刷新最新积分\n- 新增 GitHub 版本升级检测、小红点提醒及自动匹配当前系统安装包下载\n- 桌面端固定无滚动视口布局，优化窗口尺寸体验\n- 完整保留 cURL 请求头并自动补全国内版 copilot 认证域`;

  const handleDownload = (url: string, fileName: string) => {
    setDownloadTriggered(fileName);
    triggerExternalDownload(url);
    setTimeout(() => setDownloadTriggered(null), 4000);
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
              <p className="text-[11px] text-slate-400">自动比对本地与 GitHub Releases 最新版本，智能匹配当前系统安装包</p>
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
        <div className="p-5 space-y-4 overflow-y-auto text-xs">
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
          <div className="p-3.5 bg-emerald-950/20 border border-emerald-500/30 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-300 font-medium">
                <Cpu className="w-4 h-4 text-emerald-400" />
                <span>已自动识别您的系统环境：{systemEnv.label}</span>
              </div>
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            </div>

            {/* Environment Switcher (in case user wants to download for another machine) */}
            <div className="flex items-center gap-1.5 pt-1">
              <span className="text-[11px] text-slate-400 mr-1">切换目标环境:</span>
              {ENV_OPTIONS.map((opt) => (
                <button
                  key={opt.envType}
                  type="button"
                  onClick={() => onChangeEnv(opt)}
                  className={`px-2 py-1 rounded text-[11px] font-mono transition-colors cursor-pointer ${
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

          {/* GitHub Release Notes (升级文案) */}
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
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 font-mono text-[11px] leading-relaxed whitespace-pre-wrap max-h-44 overflow-y-auto select-text">
              {defaultReleaseNotes}
            </div>
          </div>

          {/* Download Feedback Banner */}
          {downloadTriggered && (
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>已开始自动下载对应系统安装包：{downloadTriggered}</span>
            </div>
          )}

          {/* Primary & Backup Download Buttons */}
          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={() => handleDownload(matched.primaryUrl, matched.primaryName)}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>
                {hasUpdate ? '立即更新并自动下载安装包' : '重新下载当前系统安装包'} ({matched.primaryName}
                {matched.primarySizeMb ? ` · ${matched.primarySizeMb}` : ''})
              </span>
            </button>

            {matched.backupUrl && matched.backupName && (
              <div className="flex items-center justify-between px-1 text-[11px] text-slate-400">
                <button
                  type="button"
                  onClick={() => handleDownload(matched.backupUrl!, matched.backupName!)}
                  className="text-indigo-400 hover:text-indigo-300 underline cursor-pointer flex items-center gap-1"
                >
                  <Monitor className="w-3 h-3" />
                  <span>下载免安装便携版 / 备用包 ({matched.backupName})</span>
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
