import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  UserPlus,
  Play,
  CalendarCheck,
  Compass,
  Gift,
  XCircle,
  Search,
  CheckSquare,
  Square,
  Trash2,
  ChevronRight,
  Sparkles,
  Info,
  Clock,
  Layers,
  Terminal,
  ExternalLink,
  Loader2,
  Check,
  Copy,
} from 'lucide-react';
import { WorkBuddyAccount, WorkBuddyTask, ExecutionLog, SystemExecutionStats } from '../types/workbuddy';
import { INITIAL_ACCOUNTS } from '../utils/initialData';
import { automationEngine } from '../utils/automationEngine';
import { AddAccountModal } from './AddAccountModal';

interface WorkBuddyWorkspaceProps {
  onOpenPackagingGuide: () => void;
  onOpenGitHubSync: () => void;
}

export const WorkBuddyWorkspace: React.FC<WorkBuddyWorkspaceProps> = ({
  onOpenPackagingGuide,
  onOpenGitHubSync,
}) => {
  // Accounts state with localStorage persistence
  const [accounts, setAccounts] = useState<WorkBuddyAccount[]>(() => {
    try {
      const saved = localStorage.getItem('workbuddy_accounts_data_v1');
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return INITIAL_ACCOUNTS;
  });

  // Selected account in left sidebar
  const [currentAccountId, setCurrentAccountId] = useState<string>(() => accounts[0]?.id || '67936417');

  // Selected accounts for batch execution (checkboxes)
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([accounts[0]?.id || '67936417']);

  // Selected task in right table for bottom detail inspector
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Filter tabs for tasks: '全部' | '未完成' | '已领奖'
  const [taskFilter, setTaskFilter] = useState<'全部' | '未完成' | '已领奖'>('全部');

  // Search keyword for left sidebar
  const [searchKeyword, setSearchKeyword] = useState('');

  // Execution scope radio: 'all' | 'selected'
  const [executionScope, setExecutionScope] = useState<'all' | 'selected'>('all');

  // Running state
  const [isRunning, setIsRunning] = useState(false);
  const [runningStatusText, setRunningStatusText] = useState('就绪');

  // Stats ribbon
  const [stats, setStats] = useState<SystemExecutionStats>({
    total: accounts.length,
    queued: 0,
    running: 0,
    roundSuccess: 1,
    roundFailed: 0,
    skipped: 0,
    lastRefreshed: '19:24',
  });

  // Logs stream
  const [logs, setLogs] = useState<ExecutionLog[]>([
    {
      id: 'log_init',
      timestamp: '19:24:10',
      accountId: '67936417',
      level: 'info',
      message: '[67936417] 已开启自动旅行 (按到达时间有界处理，可随时关闭)',
    },
  ]);

  // Modals
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [showFullLogs, setShowFullLogs] = useState(false);
  const [copiedDetail, setCopiedDetail] = useState(false);

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('workbuddy_accounts_data_v1', JSON.stringify(accounts));
    setStats((prev) => ({
      ...prev,
      total: accounts.length,
    }));
  }, [accounts]);

  // Current active account
  const currentAccount = accounts.find((a) => a.id === currentAccountId) || accounts[0];

  // Current selected task for inspection
  const selectedTask = currentAccount?.tasks.find((t) => t.id === selectedTaskId);

  // Filter accounts in sidebar
  const filteredAccounts = accounts.filter((acc) => {
    const q = searchKeyword.trim().toLowerCase();
    if (!q) return true;
    return acc.id.toLowerCase().includes(q) || acc.nickname.toLowerCase().includes(q) || acc.region.toLowerCase().includes(q);
  });

  // Add Log Helper
  const addLog = (level: ExecutionLog['level'], accountId: string, message: string) => {
    const newLog: ExecutionLog = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      accountId,
      level,
      message,
    };
    setLogs((prev) => [newLog, ...prev.slice(0, 100)]);
  };

  // Add new account
  const handleAddAccount = (newAcc: WorkBuddyAccount) => {
    setAccounts((prev) => [newAcc, ...prev]);
    setSelectedAccountIds((prev) => [...prev, newAcc.id]);
    setCurrentAccountId(newAcc.id);
    addLog('success', newAcc.id, `成功添加账号 [${newAcc.id}] (${newAcc.region})`);
  };

  // Delete selected accounts
  const handleDeleteSelectedAccounts = () => {
    if (selectedAccountIds.length === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedAccountIds.length} 个账号吗？`)) return;

    setAccounts((prev) => {
      const remaining = prev.filter((a) => !selectedAccountIds.includes(a.id));
      if (remaining.length > 0 && selectedAccountIds.includes(currentAccountId)) {
        setCurrentAccountId(remaining[0].id);
      }
      return remaining;
    });
    setSelectedAccountIds([]);
    addLog('warn', 'system', `已删除所选账号`);
  };

  // Select all / Inverse select
  const handleSelectAll = () => {
    if (selectedAccountIds.length === filteredAccounts.length) {
      setSelectedAccountIds([]);
    } else {
      setSelectedAccountIds(filteredAccounts.map((a) => a.id));
    }
  };

  const handleInverseSelect = () => {
    const newSelected = filteredAccounts
      .map((a) => a.id)
      .filter((id) => !selectedAccountIds.includes(id));
    setSelectedAccountIds(newSelected);
  };

  const toggleSelectAccount = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Refresh all accounts status
  const handleRefreshAll = () => {
    const timeStr = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    setStats((prev) => ({
      ...prev,
      lastRefreshed: timeStr,
    }));
    addLog('info', 'system', '刷新全部账号状态成功');
  };

  // Toggle Cat Auto-Travel
  const toggleCatAutoTravel = () => {
    if (!currentAccount) return;
    setAccounts((prev) =>
      prev.map((acc) =>
        acc.id === currentAccount.id
          ? {
              ...acc,
              catTravel: {
                ...acc.catTravel,
                autoTravel: !acc.catTravel.autoTravel,
              },
            }
          : acc
      )
    );
    addLog(
      'info',
      currentAccount.id,
      `[${currentAccount.id}] ${!currentAccount.catTravel.autoTravel ? '已开启自动旅行' : '已关闭自动旅行'}`
    );
  };

  // Execute All Daily Tasks
  const handleExecuteAllDaily = async () => {
    if (isRunning) return;
    const targetAccounts =
      executionScope === 'all'
        ? accounts
        : accounts.filter((a) => selectedAccountIds.includes(a.id));

    if (targetAccounts.length === 0) {
      alert('请先选择要执行任务的账号！');
      return;
    }

    setIsRunning(true);
    setRunningStatusText('正在执行日常任务...');
    setStats((prev) => ({
      ...prev,
      running: targetAccounts.length,
      queued: 0,
    }));

    try {
      const updated = await automationEngine.runDailyTasks(
        targetAccounts,
        (logItem, currentProgressAccounts, delta) => {
          setLogs((prev) => [logItem, ...prev.slice(0, 100)]);
          setStats((prev) => ({
            ...prev,
            roundSuccess: delta.successes,
            roundFailed: delta.fails,
            skipped: delta.skips,
          }));

          // Merge updated accounts
          setAccounts((prev) =>
            prev.map((acc) => {
              const found = currentProgressAccounts.find((p) => p.id === acc.id);
              return found || acc;
            })
          );
        }
      );

      setAccounts((prev) =>
        prev.map((acc) => {
          const found = updated.find((u) => u.id === acc.id);
          return found || acc;
        })
      );
      setRunningStatusText('全部任务执行完毕');
    } finally {
      setIsRunning(false);
      setStats((prev) => ({
        ...prev,
        running: 0,
        lastRefreshed: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      }));
    }
  };

  // Execute Cat Travel Only
  const handleExecuteCatTravel = async () => {
    if (isRunning) return;
    const targetAccounts =
      executionScope === 'all'
        ? accounts
        : accounts.filter((a) => selectedAccountIds.includes(a.id));

    if (targetAccounts.length === 0) return;

    setIsRunning(true);
    setRunningStatusText('正在执行猫猫旅行...');
    try {
      const updated = await automationEngine.runCatTravelOnly(targetAccounts, (logItem, currentProgressAccounts) => {
        setLogs((prev) => [logItem, ...prev.slice(0, 100)]);
        setAccounts((prev) =>
          prev.map((acc) => {
            const found = currentProgressAccounts.find((p) => p.id === acc.id);
            return found || acc;
          })
        );
      });
      setAccounts((prev) =>
        prev.map((acc) => {
          const found = updated.find((u) => u.id === acc.id);
          return found || acc;
        })
      );
    } finally {
      setIsRunning(false);
      setRunningStatusText('就绪');
    }
  };

  // Cancel execution
  const handleCancelExecution = () => {
    automationEngine.cancel();
    setIsRunning(false);
    setRunningStatusText('已取消');
    addLog('warn', 'system', '用户取消了当前的批量执行操作');
  };

  // Filter tasks in table
  const displayedTasks = (currentAccount?.tasks || []).filter((task) => {
    if (taskFilter === '未完成') return task.status !== '已领奖';
    if (taskFilter === '已领奖') return task.status === '已领奖';
    return true;
  });

  const copyDetailText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedDetail(true);
    setTimeout(() => setCopiedDetail(false), 2000);
  };

  return (
    <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col font-sans select-none">
      {/* 1. Window Title Bar & Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/90 border-b border-slate-800">
        <div className="flex items-center gap-3">
          {/* WorkBuddy Icon */}
          <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white shadow-sm">
            <span className="text-xs font-bold font-mono">W</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-100 text-sm tracking-tight">WorkBuddy 账号日常工具</span>
            <span className="text-[11px] font-mono text-slate-400">v0.5.9</span>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAddAccountOpen(true)}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
            <span>+ 添加账号</span>
          </button>
          <button
            onClick={handleRefreshAll}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
            <span>刷新全部</span>
          </button>
        </div>
      </div>

      {/* 2. Top Summary Metrics Strip */}
      <div className="px-5 py-2.5 bg-slate-950/50 border-b border-slate-800 flex flex-wrap items-center justify-between text-xs font-mono text-slate-400 gap-y-2">
        <div className="flex items-center gap-5 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-100 text-sm">{stats.total}</span>
            <span>总账号</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-100 text-sm">{stats.queued}</span>
            <span>排队</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`font-bold text-sm ${stats.running > 0 ? 'text-emerald-400 animate-pulse' : 'text-slate-100'}`}>
              {stats.running}
            </span>
            <span>运行中</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-emerald-400 text-sm">{stats.roundSuccess}</span>
            <span>本轮成功</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-rose-400 text-sm">{stats.roundFailed}</span>
            <span>本轮失败</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-amber-400 text-sm">{stats.skipped}</span>
            <span>跳过</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-slate-400">
          <Clock className="w-3.5 h-3.5 text-slate-500" />
          <span>{stats.lastRefreshed} 最近刷新</span>
        </div>
      </div>

      {/* 3. Main Workspace Grid: Left Sidebar (Accounts) + Right Workspace (Details & Tasks) */}
      <div className="grid grid-cols-1 md:grid-cols-12 min-h-[580px]">
        {/* Left Column: Accounts List (3.5 cols) */}
        <div className="md:col-span-4 lg:col-span-3 border-r border-slate-800 bg-slate-950/70 flex flex-col justify-between">
          <div>
            {/* Search Input */}
            <div className="p-3 border-b border-slate-800">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder="搜索昵称/区域"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Account List Table Header */}
            <div className="grid grid-cols-12 px-3 py-2 text-[11px] font-semibold text-slate-400 border-b border-slate-800 bg-slate-900/40">
              <span className="col-span-2">选择</span>
              <span className="col-span-5">账号</span>
              <span className="col-span-3">区域</span>
              <span className="col-span-2 text-right">状态</span>
            </div>

            {/* Accounts Table Body */}
            <div className="overflow-y-auto max-h-[460px] divide-y divide-slate-800/40">
              {filteredAccounts.map((account) => {
                const isCurrent = account.id === currentAccountId;
                const isChecked = selectedAccountIds.includes(account.id);

                return (
                  <div
                    key={account.id}
                    onClick={() => setCurrentAccountId(account.id)}
                    className={`grid grid-cols-12 px-3 py-2.5 text-xs items-center cursor-pointer transition-colors ${
                      isCurrent
                        ? 'bg-slate-800/90 text-white font-medium'
                        : 'text-slate-300 hover:bg-slate-900/80'
                    }`}
                  >
                    <div
                      className="col-span-2 flex items-center"
                      onClick={(e) => toggleSelectAccount(account.id, e)}
                    >
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-600 hover:text-slate-400" />
                      )}
                    </div>
                    <div className="col-span-5 font-mono truncate" title={account.id}>
                      {account.nickname || account.id}
                    </div>
                    <div className="col-span-3 text-[11px] text-slate-400">
                      {account.region}
                    </div>
                    <div className="col-span-2 text-right">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                          account.status === '正常'
                            ? 'text-emerald-400'
                            : account.status === '运行中'
                            ? 'text-amber-400 animate-pulse'
                            : 'text-slate-400'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {account.status}
                      </span>
                    </div>
                  </div>
                );
              })}

              {filteredAccounts.length === 0 && (
                <div className="p-6 text-center text-slate-500 text-xs">
                  未找到匹配账号
                </div>
              )}
            </div>
          </div>

          {/* Left Column Bottom Batch Actions */}
          <div className="p-3 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={handleSelectAll}
                className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                全选
              </button>
              <span className="text-slate-700">|</span>
              <button
                onClick={handleInverseSelect}
                className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                反选
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 font-mono">
                已选 {selectedAccountIds.length} / 共 {accounts.length}
              </span>
              {selectedAccountIds.length > 0 && (
                <button
                  onClick={handleDeleteSelectedAccounts}
                  className="text-rose-400 hover:text-rose-300 text-xs flex items-center gap-0.5 transition-colors cursor-pointer"
                  title="删除所选"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>删除所选</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Account Workspace & Task Details (8.5 cols) */}
        <div className="md:col-span-8 lg:col-span-9 p-5 flex flex-col justify-between space-y-4 bg-slate-900/50">
          {currentAccount ? (
            <div className="space-y-4">
              {/* Account Header: ID, Region, Update time, Points */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800/80 gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-100 font-mono tracking-tight">
                      {currentAccount.nickname || currentAccount.id}
                    </h2>
                    <span className="px-2 py-0.5 bg-slate-800 text-slate-300 border border-slate-700 rounded text-[11px]">
                      {currentAccount.region}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    更新于 {currentAccount.lastUpdated}
                  </div>
                </div>

                {/* Points Counter */}
                <div className="text-right">
                  <div className="text-2xl font-bold font-mono text-emerald-400 tracking-tight flex items-baseline justify-end gap-1">
                    <span>{currentAccount.points}</span>
                    <span className="text-xs text-slate-400 font-normal">积分</span>
                  </div>
                </div>
              </div>

              {/* Feature Card 1: 猫猫旅行 (Cat Travel) */}
              <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🐱</span>
                    <span className="font-semibold text-slate-100 text-sm">猫猫旅行</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                        currentAccount.catTravel.status === '今日已完成'
                          ? 'bg-slate-800 text-emerald-400 border border-emerald-500/30'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {currentAccount.catTravel.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleCatAutoTravel}
                      className={`px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                        currentAccount.catTravel.autoTravel
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                      }`}
                    >
                      <span>{currentAccount.catTravel.autoTravel ? '☑ 自动旅行' : '☐ 自动旅行'}</span>
                    </button>
                    <button
                      onClick={handleExecuteCatTravel}
                      disabled={isRunning}
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded border border-slate-700 transition-colors cursor-pointer"
                    >
                      刷新状态
                    </button>
                  </div>
                </div>

                <div className="text-xs text-slate-400 font-mono space-y-1">
                  <div>状态更新于 {currentAccount.catTravel.statusUpdated}</div>
                  <div className="text-slate-300">{currentAccount.catTravel.detailMessage}</div>
                  <div className="text-slate-400">
                    最近一次结果: {currentAccount.catTravel.lastResult}
                  </div>
                </div>
              </div>

              {/* Feature Card 2: 任务明细 (Task Breakdown) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-200 text-sm">任务明细</h3>

                  {/* Filter tabs: 全部 | 未完成 | 已领奖 */}
                  <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                    {(['全部', '未完成', '已领奖'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setTaskFilter(tab)}
                        className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                          taskFilter === tab
                            ? 'bg-slate-800 text-white font-medium shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tasks Table */}
                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60">
                  <div className="grid grid-cols-12 px-3 py-2 text-[11px] font-semibold text-slate-400 bg-slate-900/70 border-b border-slate-800">
                    <span className="col-span-3">名称</span>
                    <span className="col-span-2">状态</span>
                    <span className="col-span-1">进度</span>
                    <span className="col-span-2">奖励</span>
                    <span className="col-span-2">最近结果</span>
                    <span className="col-span-2">原因</span>
                  </div>

                  <div className="divide-y divide-slate-800/40 max-h-[220px] overflow-y-auto">
                    {displayedTasks.map((task) => {
                      const isSelected = selectedTaskId === task.id;

                      return (
                        <div
                          key={task.id}
                          onClick={() => setSelectedTaskId(task.id)}
                          className={`grid grid-cols-12 px-3 py-2 text-xs items-center cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-emerald-950/30 border-l-2 border-emerald-500 text-white'
                              : 'text-slate-300 hover:bg-slate-900/60'
                          }`}
                        >
                          <span className="col-span-3 font-medium truncate" title={task.name}>
                            {task.name}
                          </span>
                          <span className="col-span-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                task.status === '已领奖'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : task.status === '需等待'
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : task.status === '需人工'
                                  ? 'bg-slate-800 text-slate-300 border border-slate-700'
                                  : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                              }`}
                            >
                              {task.status}
                            </span>
                          </span>
                          <span className="col-span-1 font-mono text-[11px] text-slate-400">
                            {task.currentProgress}/{task.targetProgress}
                          </span>
                          <span className="col-span-2 font-mono text-[11px] text-emerald-400">
                            {task.reward} 分
                          </span>
                          <span className="col-span-2 text-[11px] text-slate-400 truncate" title={task.recentResult}>
                            {task.recentResult || '-'}
                          </span>
                          <span className="col-span-2 text-[11px] text-slate-400 truncate" title={task.reason}>
                            {task.reason || '-'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Task Detail Inspector (Bottom of tasks) */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/90 text-xs space-y-1.5">
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span>
                    最近结果：<strong className="text-slate-200">{selectedTask ? `(${selectedTask.name}) ${selectedTask.recentResult}` : '(未选中任务)'}</strong>
                  </span>
                  {selectedTask && (
                    <button
                      onClick={() => copyDetailText(selectedTask.reason)}
                      className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                    >
                      {copiedDetail ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedDetail ? '已复制原因' : '复制原因'}</span>
                    </button>
                  )}
                </div>
                <div className="text-slate-400 text-[11px]">
                  原因：
                  <span className="text-slate-300 select-all font-mono ml-1">
                    {selectedTask ? selectedTask.reason : '选中一行任务后，此处完整显示最近结果与原因，内容可选可复制'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-2 py-12">
              <Layers className="w-8 h-8 opacity-40" />
              <span>暂无选中的账号，请在左侧选择或点击“+ 添加账号”</span>
            </div>
          )}

          {/* 4. Bottom Execution Toolbar (Strict match with reference screenshot) */}
          <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Left radio scope options */}
            <div className="flex items-center gap-3 text-xs text-slate-300">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="executionScope"
                  checked={executionScope === 'all'}
                  onChange={() => setExecutionScope('all')}
                  className="text-emerald-500 focus:ring-emerald-500"
                />
                <span>全部账号</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="executionScope"
                  checked={executionScope === 'selected'}
                  onChange={() => setExecutionScope('selected')}
                  className="text-emerald-500 focus:ring-emerald-500"
                />
                <span>所选账号 ({selectedAccountIds.length})</span>
              </label>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleExecuteAllDaily}
                disabled={isRunning}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer"
              >
                {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                <span>一键执行全部日常</span>
              </button>

              <button
                onClick={handleExecuteAllDaily}
                disabled={isRunning}
                className="px-3.5 py-2 bg-emerald-700/80 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg shadow-sm flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer"
              >
                <CalendarCheck className="w-3.5 h-3.5" />
                <span>签到 / 每日活跃</span>
              </button>

              <button
                onClick={handleExecuteCatTravel}
                disabled={isRunning}
                className="px-3.5 py-2 bg-emerald-700/80 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg shadow-sm flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer"
              >
                <Compass className="w-3.5 h-3.5" />
                <span>一键猫猫旅行</span>
              </button>

              <button
                onClick={handleExecuteAllDaily}
                disabled={isRunning}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg border border-slate-700 transition-colors disabled:opacity-40 cursor-pointer"
              >
                <Gift className="w-3.5 h-3.5 text-amber-400" />
                <span>完成任务并领奖</span>
              </button>

              {isRunning ? (
                <button
                  onClick={handleCancelExecution}
                  className="px-3 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 text-xs rounded-lg border border-rose-500/30 transition-colors cursor-pointer"
                >
                  <XCircle className="w-3.5 h-3.5 inline mr-1" />
                  <span>取消</span>
                </button>
              ) : (
                <button
                  onClick={() => addLog('info', 'system', '重置状态就绪')}
                  className="px-2 py-2 text-slate-400 hover:text-slate-300 text-xs transition-colors"
                >
                  取消
                </button>
              )}

              <span className="text-xs font-mono text-slate-400 ml-1">
                {runningStatusText}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Bottom Log Bar (Strict match with reference screenshot) */}
      <div className="px-4 py-2 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
        <div
          onClick={() => setShowFullLogs(!showFullLogs)}
          className="flex items-center gap-2 truncate cursor-pointer hover:text-slate-200 transition-colors"
          title="点击展开/收起全部日志"
        >
          <span className="text-slate-500">日志 · 最近:</span>
          <span className="font-mono text-slate-300 truncate">
            {logs[0]?.message || '等待任务开始...'}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setLogs([])}
            className="text-slate-400 hover:text-slate-200 text-xs transition-colors cursor-pointer"
          >
            清空
          </button>
        </div>
      </div>

      {/* Expandable Full Log Drawer */}
      {showFullLogs && (
        <div className="p-4 bg-slate-950 border-t border-slate-800 max-h-48 overflow-y-auto space-y-1 font-mono text-[11px]">
          {logs.map((log) => (
            <div
              key={log.id}
              className={`flex items-start gap-2 ${
                log.level === 'success'
                  ? 'text-emerald-400'
                  : log.level === 'warn'
                  ? 'text-amber-400'
                  : log.level === 'error'
                  ? 'text-rose-400'
                  : 'text-slate-400'
              }`}
            >
              <span className="text-slate-600 shrink-0">{log.timestamp}</span>
              <span>{log.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Add Account Modal */}
      <AddAccountModal
        isOpen={isAddAccountOpen}
        onClose={() => setIsAddAccountOpen(false)}
        onAdd={handleAddAccount}
      />
    </div>
  );
};
