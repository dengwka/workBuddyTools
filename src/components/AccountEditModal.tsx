import React, { useState, useEffect } from 'react';
import { X, Key, Globe, Shield, Sparkles, RefreshCw, CheckCircle2, AlertCircle, Loader2, Edit3 } from 'lucide-react';
import { WorkBuddyAccount, AccountRegion } from '../types/workbuddy';
import { workbuddyRealApi, extractCleanCredentials } from '../utils/workbuddyRealApi';

interface AccountEditModalProps {
  isOpen: boolean;
  account: WorkBuddyAccount | null;
  onClose: () => void;
  onSave: (updatedAccount: WorkBuddyAccount) => void;
}

export const AccountEditModal: React.FC<AccountEditModalProps> = ({
  isOpen,
  account,
  onClose,
  onSave,
}) => {
  const [nickname, setNickname] = useState('');
  const [region, setRegion] = useState<AccountRegion>('国内版');
  const [authType, setAuthType] = useState<'cookie' | 'token'>('cookie');
  const [credentials, setCredentials] = useState('');
  const [proxyUrl, setProxyUrl] = useState('');
  const [points, setPoints] = useState<number>(0);
  
  // Live test state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    livePoints?: number;
  } | null>(null);

  // Form error message
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (account) {
      setNickname(account.nickname || account.id);
      setRegion(account.region || '国内版');
      setAuthType(account.authType || 'cookie');
      setCredentials(account.credentials || '');
      setProxyUrl(account.proxyUrl || '');
      setPoints(account.points || 0);
      setTestResult(null);
      setErrorMessage('');
    }
  }, [account, isOpen]);

  if (!isOpen || !account) return null;

  // Test credentials and fetch live points from official WorkBuddy API
  const handleTestAndFetchPoints = async () => {
    if (!credentials.trim()) {
      setErrorMessage('请先输入 Cookie、Token 或完整 cURL 命令后再进行测试');
      return;
    }

    const cleaned = extractCleanCredentials(credentials, authType);
    if (cleaned.credentials !== credentials.trim() || cleaned.authType !== authType) {
      setCredentials(cleaned.credentials);
      setAuthType(cleaned.authType);
    }

    setErrorMessage('');
    setIsTesting(true);
    setTestResult(null);

    try {
      const headerCount = cleaned.extraHeaders ? Object.keys(cleaned.extraHeaders).length : 0;
      const summaryRes = await workbuddyRealApi.getResourceSummary(
        cleaned.credentials,
        cleaned.authType,
        cleaned.extraHeaders
      );
      
      if (summaryRes.ok && summaryRes.data) {
        const resData = summaryRes.data.data || summaryRes.data;
        const liveCredit =
          resData.TotalCredits ??
          resData.total_credit ??
          resData.balance ??
          resData.platform_reward_credit ??
          resData.available_credits;

        if (liveCredit !== undefined && liveCredit !== null) {
          setPoints(Number(liveCredit));
          const extraNote = cleaned.isExtractedFromCurl
            ? `已自动提取 cURL 凭据${headerCount > 0 ? `及 ${headerCount} 个请求头` : ''}${cleaned.autoCompletedRealm ? ' (已自动补全 copilot 认证域)' : ''}！`
            : cleaned.autoCompletedRealm
            ? '已自动补全 copilot 认证域并验证成功！'
            : '接口验证成功！';
          setTestResult({
            success: true,
            message: `${extraNote} 官方实时积分已同步：${liveCredit} 积分`,
            livePoints: Number(liveCredit),
          });
          return;
        }
      }

      // If resource summary is empty or failed, also try tasks endpoint to verify token validity
      const taskRes = await workbuddyRealApi.getGrowthTasks(
        cleaned.credentials,
        cleaned.authType,
        cleaned.extraHeaders
      );
      if (taskRes.ok) {
        setTestResult({
          success: true,
          message: '接口鉴权成功！成长中心接口响应正常。',
        });
        return;
      }

      if (summaryRes.status === 401 || taskRes.status === 401) {
        setTestResult({
          success: false,
          message:
            '官方接口返回 401 Unauthorized：Cookie 或 Token 已过期，请重新在浏览器复制最新的 session 或完整 cURL 命令。',
        });
      } else {
        setTestResult({
          success: false,
          message: `接口响应状态码 ${summaryRes.status || taskRes.status}，请核对凭据或稍后重试。`,
        });
      }
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : '连接服务异常，请检查网络或后端代理。',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!credentials.trim()) {
      setErrorMessage('请输入授权认证凭据 (Cookie、Token 或 cURL 命令)');
      return;
    }

    const cleaned = extractCleanCredentials(credentials, authType);

    const updated: WorkBuddyAccount = {
      ...account,
      nickname: nickname.trim() || account.id,
      region,
      authType: cleaned.authType,
      credentials: cleaned.credentials,
      extraHeaders: cleaned.extraHeaders || account.extraHeaders,
      proxyUrl: proxyUrl.trim() || undefined,
      points: Number(points) || 0,
      status: testResult?.success ? '正常' : account.status,
      lastUpdated: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    };

    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-100 text-sm">编辑 WorkBuddy 账号</h3>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {account.id}
                </span>
              </div>
              <p className="text-xs text-slate-400">修改账号昵称、更新 Cookie / Token 凭据及自动获取实时积分</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-300 font-medium block mb-1">账号 ID (UID)</label>
              <input
                type="text"
                value={account.id}
                disabled
                className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-400 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="text-slate-300 font-medium block mb-1">账号昵称 / 备注</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="例如 主账号01"
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-300 font-medium block mb-1 flex items-center gap-1">
                <Globe className="w-3.5 h-3.5 text-emerald-400" />
                <span>运行区域 (Region)</span>
              </label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value as AccountRegion)}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="国内版">国内版</option>
                <option value="国际版">国际版 (Global)</option>
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-slate-300 font-medium">当前积分 (Points)</label>
                {testResult?.livePoints !== undefined && (
                  <span className="text-[10px] text-emerald-400 font-mono">已由服务自动获取</span>
                )}
              </div>
              <input
                type="number"
                value={points}
                onChange={(e) => setPoints(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-300 font-medium flex items-center gap-1">
                <Key className="w-3.5 h-3.5 text-emerald-400" />
                <span>授权认证凭据 (Cookie 或 Token) *</span>
              </label>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="editAuthType"
                    checked={authType === 'cookie'}
                    onChange={() => setAuthType('cookie')}
                    className="text-emerald-500 focus:ring-emerald-500"
                  />
                  <span className="text-slate-300">Cookie</span>
                </label>
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="editAuthType"
                    checked={authType === 'token'}
                    onChange={() => setAuthType('token')}
                    className="text-emerald-500 focus:ring-emerald-500"
                  />
                  <span className="text-slate-300">Token</span>
                </label>
              </div>
            </div>

            <textarea
              value={credentials}
              onChange={(e) => {
                setCredentials(e.target.value);
                setTestResult(null);
              }}
              placeholder={
                authType === 'cookie'
                  ? '粘贴在 workbuddy.cn 浏览器复制的完整 Cookie 字符串 (包含 session / session_2 / qcloud_visitId 等)'
                  : '粘贴 Authorization: Bearer 后面的 Token 字符串'
              }
              rows={4}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500 resize-none leading-relaxed"
            />

            {/* Test and Live Points Sync Button */}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleTestAndFetchPoints}
                disabled={isTesting}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isTesting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span>测试凭据并自动获取实时积分</span>
              </button>

              <span className="text-[11px] text-slate-500">
                支持直连 workbuddy.cn 官方成长中心
              </span>
            </div>

            {/* Test Result Feedback */}
            {testResult && (
              <div
                className={`mt-2 p-2.5 rounded-xl border text-xs flex items-start gap-2 ${
                  testResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                )}
                <div className="leading-relaxed font-mono text-[11px]">
                  {testResult.message}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="text-slate-300 font-medium block mb-1 flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-slate-400" />
              <span>代理设置 (可选，如 http://127.0.0.1:7890)</span>
            </label>
            <input
              type="text"
              value={proxyUrl}
              onChange={(e) => setProxyUrl(e.target.value)}
              placeholder="留空则直接连接官方接口"
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
            <div className="text-[11px] text-slate-500">
              双击账号随时可再次唤起此面板进行更新
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-xl shadow-md transition-colors cursor-pointer"
              >
                保存修改
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
