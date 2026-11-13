import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Download,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  Cpu,
  ArrowUpCircle,
  Package,
  ShieldCheck,
  Loader2,
  Zap,
} from 'lucide-react';

export const CURRENT_APP_VERSION = '1.3.2';
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
  stage?: 'downloading' | 'installing' | 'done' | 'error';
  autoInstalled?: boolean;
  error?: string;
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
): { primaryUrl: string; primaryName: string; primarySizeMb?: string; hasAsset: boolean } {
  const assets = release?.assets || [];
  let matchedAsset: GitHubReleaseAsset | undefined;

  if (env.envType === 'win-x64') {
    matchedAsset =
      assets.find((a) => a.name.toLowerCase().includes('setup') && a.name.endsWith('.exe')) ||
      assets.find((a) => a.name.endsWith('.exe'));
  } else if (env.envType === 'mac-arm64') {
    matchedAsset =
      assets.find((a) => a.name.endsWith('.dmg') && a.name.includes('arm64')) ||
      assets.find((a) => a.name.endsWith('.zip') && a.name.includes('arm64'));
  } else {
    matchedAsset =
      assets.find((a) => a.name.endsWith('.dmg') && a.name.includes('x64')) ||
      assets.find((a) => a.name.endsWith('.zip') && a.name.includes('x64'));
  }

  if (!matchedAsset) {
    return {
      primaryUrl: '',
      primaryName:
        env.envType === 'win-x64'
          ? 'Windows 安装包 (.exe)'
          : env.envType === 'mac-arm64'
          ? 'macOS arm64 安装包 (.dmg)'
          : 'macOS x64 安装包 (.dmg)',
      hasAsset: false,
    };
  }

  return {
    primaryUrl: matchedAsset.browser_download_url,
    primaryName: matchedAsset.name,
    primarySizeMb:
      matchedAsset.size > 0 ? `${(matchedAsset.size / 1024 / 1024).toFixed(1)} MB` : undefined,
    hasAsset: true,
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
  const [hasChecked, setHasChecked] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
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
    setCheckError(null);
    try {
      const winAny = window as unknown as {
        electronAPI?: {
          checkLatestRelease?: () => Promise<GitHubReleaseInfo | null>;
        };
      };

      let data: GitHubReleaseInfo | null = null;
      if (typeof winAny.electronAPI?.checkLatestRelease === 'function') {
        data = await winAny.electronAPI.checkLatestRelease().catch(() => null);
      }

      if (!data) {
        const backendRes = await fetch('/api/update/latest').catch(() => null);
        if (backendRes?.ok) {
          data = await backendRes.json().catch(() => null);
        }
      }

      if (!data) {
        const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
          headers: { Accept: 'application/vnd.github+json' },
        }).catch(() => null);
        if (res?.ok) {
          data = await res.json().catch(() => null);
        }
      }

      if (data && data.tag_name) {
        setRelease(data);
        const isNewer = compareSemver(data.tag_name, localVersion) > 0;
        setHasUpdate(isNewer);
        setHasChecked(true);
        setLastCheckedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
      } else {
        setCheckError('未能获取到 GitHub Release 版本信息，请检查网络或代理状态');
      }
    } catch (err: unknown) {
      setCheckError(err instanceof Error ? err.message : '版本检测请求异常');
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
    hasChecked,
    checkError,
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
  hasChecked?: boolean;
  checkError?: string | null;
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
  hasChecked = true,
  checkError = null,
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
    `### v${localVersion} 更新说明\n- 修复 Cookie 模式 401 鉴权错配，打通专家召唤、尝鲜热门技能与资料库任务全链路\n- 严格账号权限控制与账号隔离：仅执行已勾选账号，任务、日志与实时积分完全隔离\n- 新增「[操作账号: 昵称 (短ID)]」清晰日志前缀与日志控制台一键复制功能\n- 领奖后自动刷新顶部实时积分并修复浮点精度展示`;

  const handleSmartDownload = async () => {
    setStatusMessage(null);

    if (!matched.hasAsset || !matched.primaryUrl) {
      setStatusMessage({
        ok: false,
        text: '尚未获取到对应环境安装包地址，正在为您重新拉取最新版本列表，请稍后重试。',
      });
      onCheckUpdate();
      return;
    }

    const winAny = window as unknown as {
      electronAPI?: {
        isElectron?: boolean;
        downloadAndInstallUpdate?: (payload: {
          downloadUrl: string;
          fileName: string;
          mirrorMode: string;
        }) => Promise<{
          success: boolean;
          filePath?: string;
          nodeName?: string;
          autoInstalled?: boolean;
          error?: string;
        }>;
      };
    };

    // 1. Electron Desktop App: Node.js stream download + real-time progress + auto-launch OS installer (zero browser!)
    if (winAny.electronAPI?.isElectron && typeof winAny.electronAPI.downloadAndInstallUpdate === 'function') {
      setIsDownloading(true);
      setProgress({
        percent: 0,
        receivedMb: '0.0',
        totalMb: '0.0',
        speedText: '正在连接高速节点...',
        remainingText: '',
        nodeName: '智能加速引擎',
        stage: 'downloading',
      });
      try {
        const res = await winAny.electronAPI.downloadAndInstallUpdate({
          downloadUrl: matched.primaryUrl,
          fileName: matched.primaryName,
          mirrorMode,
        });
        if (res.success) {
          setProgress((prev) => ({
            percent: 100,
            receivedMb: prev?.receivedMb || matched.primarySizeMb?.replace(' MB', '') || '100%',
            totalMb: prev?.totalMb || matched.primarySizeMb?.replace(' MB', '') || '100%',
            speedText: '已启动安装',
            remainingText: '',
            nodeName: res.nodeName || prev?.nodeName || '智能加速引擎',
            stage: 'done',
          }));
          setStatusMessage({
            ok: true,
            text: `安装包已通过 [${res.nodeName}] 下载并校验完成，已自动触发系统安装程序！（未打开浏览器）`,
          });
        } else {
          setStatusMessage({
            ok: false,
            text: `自动下载未完成：${res.error || '网络连接失败'}，请切换上方下载加速源后重试`,
          });
        }
      } catch (err: unknown) {
        setStatusMessage({
          ok: false,
          text: `自动下载异常：${err instanceof Error ? err.message : '网络超时'}，请切换下载加速源后重试`,
        });
      } finally {
        setIsDownloading(false);
      }
      return;
    }

    // 2. Local Web Server Mode (server.ts): backend stream download + SSE progress + auto-launch OS installer (zero browser!)
    setIsDownloading(true);
    setProgress({
      percent: 0,
      receivedMb: '0.0',
      totalMb: '0.0',
      speedText: '正在连接高速节点...',
      remainingText: '',
      nodeName: '智能加速引擎',
      stage: 'downloading',
    });

    try {
      const startRes = await fetch('/api/update/download-and-install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          downloadUrl: matched.primaryUrl,
          fileName: matched.primaryName,
          mirrorMode,
        }),
      });
      const startData = await startRes.json().catch(() => ({}));
      if (!startRes.ok || !startData.jobId) {
        throw new Error(startData.error || '无法启动后端流式下载');
      }

      const jobId = String(startData.jobId);

      await new Promise<void>((resolve, reject) => {
        const es = new EventSource(`/api/update/progress?jobId=${encodeURIComponent(jobId)}`);
        es.onmessage = (evt) => {
          try {
            const data: UpdateProgressData = JSON.parse(evt.data);
            setProgress(data);
            if (data.stage === 'done') {
              es.close();
              if (data.autoInstalled) {
                setStatusMessage({
                  ok: true,
                  text: `安装包 (${matched.primaryName}) 下载完成，已自动在本机触发安装程序！（未打开浏览器）`,
                });
              } else {
                // Headless server fallback: download verified file stream directly without opening external GitHub tab
                const link = document.createElement('a');
                link.href = `/api/update/file?jobId=${encodeURIComponent(jobId)}`;
                link.download = matched.primaryName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setStatusMessage({
                  ok: true,
                  text: `安装包 (${matched.primaryName}) 已完成校验与流式下载并开始保存（当前服务端为无界面容器，已直接保存安装包供双击安装）`,
                });
              }
              resolve();
            } else if (data.stage === 'error') {
              es.close();
              reject(new Error(data.error || '下载失败'));
            }
          } catch {
            // ignore parse error
          }
        };
        es.onerror = () => {
          es.close();
          reject(new Error('与更新服务的进度连接中断'));
        };
      });
    } catch (err: unknown) {
      setStatusMessage({
        ok: false,
        text: `自动更新失败：${err instanceof Error ? err.message : '网络错误'}，请切换下载加速源重试`,
      });
    } finally {
      setIsDownloading(false);
    }
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
                {isChecking ? (
                  <span className="px-2 py-0.5 text-[10px] font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 rounded-full flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    正在检测更新...
                  </span>
                ) : hasUpdate ? (
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
                  <span>{isChecking && !release ? '检测中...' : remoteTag}</span>
                  {hasUpdate && <span className="w-2 h-2 rounded-full bg-rose-500" />}
                </div>
              </div>
              <button
                type="button"
                onClick={onCheckUpdate}
                disabled={isChecking || isDownloading}
                title="重新检测 GitHub 最新版本"
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin text-emerald-400' : ''}`} />
              </button>
            </div>
          </div>

          {/* Checking State when no update detected yet */}
          {isChecking && !hasUpdate && !isDownloading ? (
            <div className="p-5 bg-slate-950/90 border border-slate-800 rounded-xl flex flex-col items-center justify-center text-center space-y-2.5">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              <div className="text-sm font-medium text-slate-200">正在自动检测最新版本...</div>
              <p className="text-[11px] text-slate-400">
                正在比对本地版本 <span className="font-mono text-slate-300">v{localVersion}</span> 与 GitHub Releases 最新正式版
              </p>
            </div>
          ) : checkError && !hasUpdate && !isDownloading ? (
            <div className="p-4 bg-rose-950/20 border border-rose-500/30 rounded-xl space-y-3">
              <div className="text-xs text-rose-300 leading-relaxed">
                自动检测版本失败：{checkError}
              </div>
              <button
                type="button"
                onClick={onCheckUpdate}
                disabled={isChecking}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 inline-flex items-center gap-1.5 text-[11px] cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>重新检测</span>
              </button>
            </div>
          ) : !hasUpdate && hasChecked && !isDownloading && progress?.stage !== 'done' ? (
            <div className="p-5 bg-emerald-950/20 border border-emerald-500/30 rounded-xl flex flex-col items-center justify-center text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="text-sm font-semibold text-emerald-300">当前已是最新版本</div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                本地当前版本 <span className="font-mono text-emerald-300">v{localVersion}</span> 已与 GitHub 最新版本{' '}
                <span className="font-mono text-emerald-300">{remoteTag}</span> 一致，无需更新。
              </p>
            </div>
          ) : (
            <>
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

              {/* Status Message */}
              {statusMessage && (
                <div
                  className={`p-2.5 rounded-xl border flex items-center gap-2 ${
                    statusMessage.ok
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  <CheckCircle2
                    className={`w-4 h-4 shrink-0 ${statusMessage.ok ? 'text-emerald-400' : 'text-rose-400'}`}
                  />
                  <span className="text-[11px] leading-relaxed">{statusMessage.text}</span>
                </div>
              )}

              {/* Primary Download & Install Button */}
              <div className="space-y-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleSmartDownload}
                  disabled={isDownloading || isChecking}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isDownloading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>
                    {isDownloading
                      ? progress?.stage === 'installing'
                        ? '下载完成，正在自动触发安装...'
                        : '正在应用内自动下载安装包...'
                      : !matched.hasAsset
                      ? isChecking
                        ? '正在获取安装包信息...'
                        : '重新获取对应环境安装包'
                      : `立即更新并自动下载安装 (${matched.primaryName}${
                          matched.primarySizeMb ? ` · ${matched.primarySizeMb}` : ''
                        })`}
                  </span>
                </button>

                {/* In-App Download & Auto-Install Progress Bar (Displayed right below update button!) */}
                {progress && (isDownloading || progress.stage === 'done' || progress.stage === 'installing') && (
                  <div className="p-3 bg-slate-950 border border-emerald-500/30 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono gap-2">
                      <span className="text-emerald-400 truncate">
                        {progress.stage === 'installing'
                          ? '⚡ 正在自动启动安装程序...'
                          : progress.stage === 'done'
                          ? '✅ 已完成下载并触发安装'
                          : progress.nodeName}
                      </span>
                      <span className="text-slate-300 shrink-0">
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

                <div className="flex items-center justify-between px-1 text-[11px] text-slate-400">
                  <span className="text-slate-500">
                    {matched.hasAsset ? `目标文件：${matched.primaryName}` : '等待获取 GitHub Release 真实资产列表'}
                  </span>

                  <button
                    type="button"
                    onClick={onCheckUpdate}
                    disabled={isChecking || isDownloading}
                    className="text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`} />
                    <span>刷新版本与资产</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
