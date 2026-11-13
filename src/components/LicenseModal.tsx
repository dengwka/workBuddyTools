import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  WifiOff,
  Loader2,
  Copy,
  Check,
  RefreshCw,
  Upload,
  Globe,
  ChevronDown,
  ChevronUp,
  Trash2,
  Clock,
  Mail,
  QrCode,
} from 'lucide-react';
import { LicenseValidationState } from '../types/workbuddy';
import { DEFAULT_APP_TYPE } from '../utils/licenseService';

interface LicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  licenseState: LicenseValidationState;
  isBusy: boolean;
  onActivateOnline: (licenseKey: string, appType: string, proxyUrl?: string) => Promise<void>;
  onVerifyOfflineFile: (licJson: Record<string, unknown>, appType: string, proxyUrl?: string) => Promise<void>;
  onManualVerify: (proxyUrl?: string) => Promise<void>;
  onClearLicense: () => Promise<void>;
}

export const LicenseModal: React.FC<LicenseModalProps> = ({
  isOpen,
  onClose,
  licenseState,
  isBusy,
  onActivateOnline,
  onVerifyOfflineFile,
  onManualVerify,
  onClearLicense,
}) => {
  const [licenseKeyInput, setLicenseKeyInput] = useState(licenseState.licenseKey || '');
  const [proxyInput, setProxyInput] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copiedMac, setCopiedMac] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [qrSrc, setQrSrc] = useState('./license-wechat-qr.png');
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLicenseKeyInput(licenseState.licenseKey || '');
      setLocalError(null);
    }
  }, [isOpen, licenseState.licenseKey]);

  if (!isOpen) return null;

  const handleCopyMac = () => {
    if (!licenseState.macAddress) return;
    navigator.clipboard.writeText(licenseState.macAddress);
    setCopiedMac(true);
    setTimeout(() => setCopiedMac(false), 2000);
  };

  const handleCopyEmail = () => {
    navigator.clipboard.writeText('wenkan_g@163.com');
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  const handleActivateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!licenseKeyInput.trim()) {
      setLocalError('请输入有效的授权码（License Key）');
      return;
    }
    await onActivateOnline(
      licenseKeyInput.trim(),
      DEFAULT_APP_TYPE,
      proxyInput.trim() || undefined
    );
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalError(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await onVerifyOfflineFile(
        parsed,
        DEFAULT_APP_TYPE,
        proxyInput.trim() || undefined
      );
    } catch {
      setLocalError('无法解析 .lic 文件：请确认导入的是合法的 JSON 离线授权文件');
    }
  };

  const renderStatusBadge = () => {
    if (licenseState.status === 'checking') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
          <Loader2 className="w-3 h-3 animate-spin" />
          正在联网校验...
        </span>
      );
    }
    if (licenseState.status === 'valid') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          <ShieldCheck className="w-3.5 h-3.5" />
          授权有效 · 剩余 {licenseState.remainingDays ?? '--'} 天
        </span>
      );
    }
    if (licenseState.status === 'grace_offline') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
          <WifiOff className="w-3.5 h-3.5" />
          弱网宽限授权 · 剩余 {licenseState.remainingDays ?? '--'} 天
        </span>
      );
    }
    if (licenseState.status === 'expired' || licenseState.status === 'invalid') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/15 text-rose-300 border border-rose-500/30">
          <ShieldAlert className="w-3.5 h-3.5" />
          {licenseState.status === 'expired' ? '授权已过期' : '授权校验失败'}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
        <ShieldOff className="w-3.5 h-3.5 text-amber-400" />
        未配置授权（可跳过安装，业务受限）
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/90">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-lg border ${
                licenseState.isAuthorized
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              }`}
            >
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-slate-100 text-sm">License 软件授权管理</h3>
                {renderStatusBadge()}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                单机设备绑定 · 支持在线授权码激活与离线证书验签
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs">
          {/* Current Status Card */}
          <div
            className={`p-3.5 rounded-xl border space-y-2.5 ${
              licenseState.status === 'valid'
                ? 'bg-emerald-950/20 border-emerald-500/30'
                : licenseState.status === 'grace_offline'
                ? 'bg-amber-950/20 border-amber-500/30'
                : licenseState.status === 'invalid' || licenseState.status === 'expired'
                ? 'bg-rose-950/25 border-rose-500/35'
                : 'bg-slate-950/80 border-slate-800'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="text-[11px] text-slate-400">当前校验结果：</div>
                <div
                  className={`text-xs font-medium leading-relaxed ${
                    licenseState.status === 'valid'
                      ? 'text-emerald-300'
                      : licenseState.status === 'grace_offline'
                      ? 'text-amber-300'
                      : licenseState.status === 'invalid' || licenseState.status === 'expired'
                      ? 'text-rose-300'
                      : 'text-slate-200'
                  }`}
                >
                  {licenseState.message}
                </div>
              </div>

              {licenseState.remainingDays !== null && (
                <div className="shrink-0 text-right px-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800">
                  <div className="text-[10px] text-slate-400">可用天数</div>
                  <div
                    className={`text-lg font-bold font-mono ${
                      licenseState.remainingDays > 0 && licenseState.isAuthorized
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {licenseState.remainingDays}
                    <span className="text-[11px] font-normal text-slate-400 ml-0.5">天</span>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-slate-800/70 text-[11px] font-mono">
              <div className="flex items-center justify-between bg-slate-950/70 px-2.5 py-1.5 rounded-lg border border-slate-800/80">
                <span className="text-slate-400">设备 MAC:</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-200">{licenseState.macAddress || '识别中...'}</span>
                  <button
                    type="button"
                    onClick={handleCopyMac}
                    title="复制当前设备 MAC 地址"
                    className="text-slate-400 hover:text-emerald-400 cursor-pointer"
                  >
                    {copiedMac ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between bg-slate-950/70 px-2.5 py-1.5 rounded-lg border border-slate-800/80">
                <span className="text-slate-400">到期时间:</span>
                <span className="text-slate-200 truncate ml-2">{licenseState.expireTime || '未激活'}</span>
              </div>

              {licenseState.licenseKey && (
                <div className="flex items-center justify-between bg-slate-950/70 px-2.5 py-1.5 rounded-lg border border-slate-800/80">
                  <span className="text-slate-400">当前 Key:</span>
                  <span className="text-emerald-300 truncate ml-2">{licenseState.licenseKey}</span>
                </div>
              )}

              {licenseState.lastVerifiedAt && (
                <div className="flex items-center justify-between bg-slate-950/70 px-2.5 py-1.5 rounded-lg border border-slate-800/80">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>最近校验:</span>
                  </span>
                  <span className="text-slate-300 truncate ml-2">
                    {new Date(licenseState.lastVerifiedAt).toLocaleString('zh-CN', { hour12: false })}
                  </span>
                </div>
              )}
            </div>
          </div>

          {localError && (
            <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs">
              {localError}
            </div>
          )}

          {/* Activate with License Key Form */}
          <form onSubmit={handleActivateSubmit} className="space-y-3 p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-200">在线授权码激活</label>
              <span className="text-[11px] text-slate-500 font-mono">长超时 35s · 多通道自动连通</span>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={licenseKeyInput}
                onChange={(e) => setLicenseKeyInput(e.target.value.toUpperCase())}
                placeholder="请输入授权码，例如：K8M4P-Q9R2T-V7W3X"
                className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 uppercase tracking-wider"
              />
              <button
                type="submit"
                disabled={isBusy}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl shadow-md flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                <span>{isBusy ? '正在请求 (最长35s)...' : '激活并绑定本机'}</span>
              </button>
            </div>

            {/* Action strip: Heartbeat, Offline .lic import, Clear */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".lic,.json"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 flex items-center gap-1.5 text-[11px] transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5 text-indigo-400" />
                  <span>导入离线 .lic 证书</span>
                </button>

                {licenseState.licenseKey && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onManualVerify(proxyInput.trim() || undefined)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 flex items-center gap-1.5 text-[11px] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isBusy ? 'animate-spin' : ''}`} />
                    <span>立即心跳校验</span>
                  </button>
                )}
              </div>

              {licenseState.licenseKey && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={onClearLicense}
                  className="px-2.5 py-1.5 bg-rose-950/30 hover:bg-rose-900/40 text-rose-300 rounded-lg border border-rose-500/30 flex items-center gap-1 text-[11px] transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>清除本地授权</span>
                </button>
              )}
            </div>
          </form>

          {/* Obtain or Purchase License Contact Card */}
          <div className="p-3.5 bg-slate-950/75 border border-emerald-500/25 rounded-xl flex items-center justify-between gap-4">
            <div className="space-y-2 min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-slate-100 font-semibold text-xs">
                <QrCode className="w-3.5 h-3.5 text-emerald-400" />
                <span>获取或购买 License 授权</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                如需购买正式授权码、续期或申请离线证书，请将上方「设备 MAC」发送至下方邮箱或微信扫码联系：
              </p>
              <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700/80 text-[11px] font-mono text-emerald-300">
                  <Mail className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>wenkan_g@163.com</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyEmail}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 inline-flex items-center gap-1 text-[11px] transition-colors cursor-pointer"
                >
                  {copiedEmail ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedEmail ? '已复制邮箱' : '复制邮箱'}</span>
                </button>
              </div>
            </div>

            <div className="shrink-0 flex flex-col items-center gap-1">
              <div className="p-1.5 bg-white rounded-xl border border-emerald-500/40 shadow-sm">
                <img
                  src={qrSrc}
                  alt="微信扫码获取 License"
                  className="w-20 h-20 object-contain rounded"
                  onError={() => {
                    if (qrSrc !== './assets/aistudio/image_b5c1ece8.png') {
                      setQrSrc('./assets/aistudio/image_b5c1ece8.png');
                    }
                  }}
                />
              </div>
              <span className="text-[10px] text-slate-400">微信扫码联系</span>
            </div>
          </div>

          {/* Collapsible Advanced Network Proxy Settings */}
          <div className="border border-slate-800 rounded-xl bg-slate-950/50 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="w-full px-3.5 py-2 flex items-center justify-between text-[11px] text-slate-300 hover:bg-slate-900/70 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-emerald-400" />
                <span>高级网络设置（外网访问代理配置）</span>
              </span>
              {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showAdvanced && (
              <div className="p-3.5 border-t border-slate-800 space-y-2.5 text-[11px]">
                <div>
                  <label className="text-slate-400 block mb-1">外网代理地址 (可选，如 http://127.0.0.1:7890)</label>
                  <input
                    type="text"
                    value={proxyInput}
                    onChange={(e) => setProxyInput(e.target.value)}
                    placeholder="留空则自动使用系统代理与 IPv4 通道"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="text-slate-400 leading-relaxed">
                  外网直连优化已自动开启：<strong className="text-slate-300">系统代理自动适配（支持 VPN / PAC）→ IPv4 优先通道 → 35 秒长超时</strong>
                </div>
              </div>
            )}
          </div>

          {/* Strategy Explanation */}
          <div className="p-3 bg-indigo-950/20 border border-indigo-500/25 rounded-xl text-[11px] text-slate-300 space-y-1 leading-relaxed">
            <div className="font-semibold text-indigo-300">校验与容错策略说明：</div>
            <div>1. <strong>启动/安装可跳过</strong>：未授权时仍可打开软件、配置账号或查看状态，但核心业务执行与领奖按钮将被锁定。</div>
            <div>2. <strong>弱网不断流</strong>：激活成功后如遇外网波动、连接超时或短暂离线，在有效期内自动进入「本地宽限授权（最长 7 天）」并后台自动重连，<strong>不中断正常业务使用</strong>。</div>
            <div>3. <strong>硬性拦截</strong>：仅当授权过期、授权码被禁用或设备不匹配时，立即锁定核心操作并弹窗/横幅提示。</div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors cursor-pointer"
            >
              {licenseState.isAuthorized ? '完成并继续使用' : '暂不配置（跳过）'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
