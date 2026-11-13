import React, { useState } from 'react';
import { X, UserPlus, Key, Globe, Shield, Sparkles, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { WorkBuddyAccount, AccountRegion } from '../types/workbuddy';
import { DEFAULT_TASKS_TEMPLATE } from '../utils/initialData';
import { workbuddyRealApi, extractCleanCredentials, roundPoints } from '../utils/workbuddyRealApi';

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (account: WorkBuddyAccount) => void;
}

export const AddAccountModal: React.FC<AddAccountModalProps> = ({ isOpen, onClose, onAdd }) => {
  const [accountId, setAccountId] = useState('');
  const [nickname, setNickname] = useState('');
  const [region, setRegion] = useState<AccountRegion>('国内版');
  const [authType, setAuthType] = useState<'cookie' | 'token'>('cookie');
  const [credentials, setCredentials] = useState('');
  const [proxyUrl, setProxyUrl] = useState('');
  const [points, setPoints] = useState<number>(0);

  const [errorMessage, setErrorMessage] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  if (!isOpen) return null;

  const fillSample = () => {
    const randomId = Math.floor(10000000 + Math.random() * 90000000).toString();
    setAccountId(randomId);
    setNickname(`WorkBuddy_${randomId.slice(-4)}`);
    setRegion('国内版');
    setAuthType('cookie');
    setCredentials(`qcloud_visitId=sample_${randomId}; session=sess_${randomId}`);
    setPoints(Math.floor(1500 + Math.random() * 2500));
    setErrorMessage('');
    setTestResult(null);
  };

  const handleTestCredentials = async () => {
    if (!credentials.trim()) {
      setErrorMessage('请先粘贴 Cookie、Token 或完整 cURL 命令再进行测试');
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
          const cleanCredit = roundPoints(liveCredit);
          setPoints(cleanCredit);
          const extraNote = cleaned.isExtractedFromCurl
            ? `已自动提取 cURL 凭据${headerCount > 0 ? `及 ${headerCount} 个请求头` : ''}${cleaned.autoCompletedRealm ? ' (已自动补全 copilot 认证域)' : ''}！`
            : cleaned.autoCompletedRealm
            ? '已自动补全 copilot 认证域并验证成功！'
            : '接口验证成功！';
          setTestResult({
            success: true,
            message: `${extraNote} 官方实时积分：${cleanCredit}`,
          });
          return;
        }
      }

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
            '官方接口返回 401 Unauthorized：该 session 已过期或缺少认证头，请在浏览器 F12 复制最新 get-user-resource-summary 的完整 cURL 粘贴重试。',
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
        message: err instanceof Error ? err.message : '连接服务异常，请检查网络或代理配置',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId.trim()) {
      setErrorMessage('请输入账号 ID 或昵称');
      return;
    }
    setErrorMessage('');

    const cleaned = extractCleanCredentials(credentials, authType);

    const newAccount: WorkBuddyAccount = {
      id: accountId.trim(),
      nickname: nickname.trim() || accountId.trim(),
      region,
      status: '正常',
      points: roundPoints(points),
      authType: cleaned.authType,
      credentials: cleaned.credentials || 'mock_credentials',
      extraHeaders: cleaned.extraHeaders,
      proxyUrl: proxyUrl.trim() || undefined,
      lastUpdated: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      catTravel: {
        status: '待出发',
        statusUpdated: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        detailMessage: '猫猫整装待发，等待下一次旅行计划',
        lastResult: '待出发',
        autoTravel: true,
      },
      tasks: DEFAULT_TASKS_TEMPLATE.map((t) => ({
        ...t,
        status: t.id === 'task_night_owl' ? '需等待' : t.id === 'task_wechat_follow' ? '需人工' : '未完成',
        currentProgress: 0,
        recentResult: '准备就绪',
      })),
    };

    onAdd(newAccount);
    onClose();
    // Reset form
    setAccountId('');
    setNickname('');
    setCredentials('');
    setTestResult(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-sm">添加 WorkBuddy 账号</h3>
              <p className="text-xs text-slate-400">支持粘贴完整 Cookie、Token 或 Chrome 复制的 cURL 命令</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto">
          {errorMessage && (
            <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 font-medium text-xs">
              {errorMessage}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={fillSample}
              className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>快速填入测试示例</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-300 font-medium block mb-1">账号 ID (UID) *</label>
              <input
                type="text"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder="例如 67936417"
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
                required
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
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="国内版">国内版</option>
                <option value="国际版">国际版 (Global)</option>
              </select>
            </div>
            <div>
              <label className="text-slate-300 font-medium block mb-1">初始积分 (自动获取或手动填)</label>
              <input
                type="number"
                value={points}
                onChange={(e) => setPoints(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="text-slate-300 font-medium block mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Key className="w-3.5 h-3.5 text-emerald-400" />
                <span>授权认证凭据 (支持 Cookie / cURL) *</span>
              </span>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="authType"
                    checked={authType === 'cookie'}
                    onChange={() => setAuthType('cookie')}
                    className="text-emerald-500"
                  />
                  <span>Cookie</span>
                </label>
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="authType"
                    checked={authType === 'token'}
                    onChange={() => setAuthType('token')}
                    className="text-emerald-500"
                  />
                  <span>Token</span>
                </label>
              </div>
            </label>
            <textarea
              value={credentials}
              onChange={(e) => {
                setCredentials(e.target.value);
                setTestResult(null);
              }}
              placeholder="直接粘贴 Chrome DevTools 复制的 Cookie 值或完整的 '复制为 cURL' 命令，工具会自动解析清洗"
              rows={3}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500 resize-none"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleTestCredentials}
                disabled={isTesting}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isTesting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span>{isTesting ? '正在验证...' : '测试凭据并自动获取实时积分'}</span>
              </button>
              <span className="text-[11px] text-slate-500">自动识别 cURL / Cookie</span>
            </div>

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
                <span>{testResult.message}</span>
              </div>
            )}

            <div className="mt-2 text-[11px] text-slate-400 leading-relaxed">
              💡 <strong>如何获取</strong>：打开 <a href="https://www.workbuddy.cn/profile/plans-usage" target="_blank" rel="noreferrer" className="text-emerald-400 underline">workbuddy.cn</a> &rarr; F12 网络 &rarr; 右键 <code className="text-amber-300">get-user-resource-summary</code> &rarr; 复制为 cURL 或复制请求头 <code className="text-amber-300">Cookie</code> 整段粘贴即可。
            </div>
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
              placeholder="留空则直接连接"
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-xl shadow-md transition-colors"
            >
              保存并添加
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
