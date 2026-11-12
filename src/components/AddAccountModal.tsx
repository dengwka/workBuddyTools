import React, { useState } from 'react';
import { X, UserPlus, Key, Globe, Shield, Sparkles } from 'lucide-react';
import { WorkBuddyAccount, AccountRegion } from '../types/workbuddy';
import { DEFAULT_TASKS_TEMPLATE } from '../utils/initialData';

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
  const [points, setPoints] = useState<number>(1000);

  const [errorMessage, setErrorMessage] = useState('');

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
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId.trim()) {
      setErrorMessage('请输入账号 ID 或昵称');
      return;
    }
    setErrorMessage('');

    const newAccount: WorkBuddyAccount = {
      id: accountId.trim(),
      nickname: nickname.trim() || accountId.trim(),
      region,
      status: '正常',
      points: Number(points) || 0,
      authType,
      credentials: credentials.trim() || 'mock_credentials',
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
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-sm">添加 WorkBuddy 账号</h3>
              <p className="text-xs text-slate-400">配置账号凭据，支持 Cookie / Token 授权</p>
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
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
              <label className="text-slate-300 font-medium block mb-1">初始积分 (Points)</label>
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
                <span>授权认证凭据 (Cookie 或 Token) *</span>
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
              onChange={(e) => setCredentials(e.target.value)}
              placeholder={
                authType === 'cookie'
                  ? '在 workbuddy.cn 浏览器控制台(F12) -> 网络 -> 复制请求头中的 Cookie 字符串粘贴至此'
                  : '在 workbuddy.cn 浏览器控制台(F12) -> 复制 Authorization: Bearer 后面的 Token'
              }
              rows={3}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500 resize-none"
            />
            <div className="mt-1 text-[11px] text-slate-400 leading-relaxed">
              💡 <strong>如何获取真实凭据</strong>：在电脑浏览器打开 <a href="https://www.workbuddy.cn/profile/growth-center" target="_blank" rel="noreferrer" className="text-emerald-400 underline">workbuddy.cn</a>，按 F12 打开开发者工具 &rarr; 切换到「网络 (Network)」&rarr; 刷新页面 &rarr; 点击任意接口 &rarr; 复制「请求标头 (Request Headers)」里的 <code className="text-amber-300">Cookie</code> 或 <code className="text-amber-300">Authorization</code>。
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
