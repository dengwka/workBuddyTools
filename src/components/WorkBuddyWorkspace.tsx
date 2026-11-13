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
  Sparkles,
  Clock,
  Layers,
  Loader2,
  Check,
  Copy,
  Edit3,
  AlertTriangle,
  ArrowUpCircle,
  Wrench,
  QrCode,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { WorkBuddyAccount, WorkBuddyTask, ExecutionLog, SystemExecutionStats } from '../types/workbuddy';
import { INITIAL_ACCOUNTS } from '../utils/initialData';
import { automationEngine } from '../utils/automationEngine';
import {
  workbuddyRealApi,
  WorkBuddyRawTask,
  mapRawTaskToWorkBuddyTask,
  sanitizeTaskProgress,
} from '../utils/workbuddyRealApi';
import { AddAccountModal } from './AddAccountModal';
import { AccountEditModal } from './AccountEditModal';
import {
  VersionUpdateModal,
  useVersionUpdater,
  CURRENT_APP_VERSION,
} from './VersionUpdateModal';
import { TaskAssistModal } from './TaskAssistModal';

export interface WorkBuddyWorkspaceProps {
  onOpenPackagingGuide?: () => void;
  onOpenGitHubSync?: () => void;
}

export const WorkBuddyWorkspace: React.FC<WorkBuddyWorkspaceProps> = () => {
  // Accounts state with localStorage persistence + NaN progress sanitization
  const [accounts, setAccounts] = useState<WorkBuddyAccount[]>(() => {
    try {
      const saved = localStorage.getItem('workbuddy_accounts_data_v2');
      if (saved) {
        const parsed = JSON.parse(saved) as WorkBuddyAccount[];
        if (Array.isArray(parsed)) {
          return parsed.map((acc) => ({
            ...acc,
            tasks: Array.isArray(acc.tasks)
              ? acc.tasks.map((t) => sanitizeTaskProgress(t))
              : [],
          }));
        }
      }
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
    roundSuccess: 0,
    roundFailed: 0,
    skipped: 0,
    lastRefreshed: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
  });

  // Logs stream
  const [logs, setLogs] = useState<ExecutionLog[]>([
    {
      id: 'log_init',
      timestamp: new Date().toLocaleTimeString('zh-CN'),
      accountId: accounts[0]?.id || 'system',
      level: 'info',
      message: `[${accounts[0]?.id || 'system'}] 工作台就绪 (双击账号可编辑更新 Cookie / cURL，点击任务右侧[辅助完成]可单点执行)`,
    },
  ]);

  // Modals & Popups
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<WorkBuddyAccount | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSyncingPoints, setIsSyncingPoints] = useState(false);
  const [copiedDetail, setCopiedDetail] = useState(false);
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [assistingTask, setAssistingTask] = useState<WorkBuddyTask | null>(null);
  const [executingTaskId, setExecutingTaskId] = useState<string | null>(null);

  // Collapsible & Draggable Log Console (Closed by default per user requirement)
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [logHeight, setLogHeight] = useState(145);

  const handleStartResizeLog = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = logHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = startY - moveEvent.clientY;
      const nextHeight = Math.min(Math.max(startHeight + deltaY, 64), 420);
      setLogHeight(nextHeight);
      if (!isLogOpen && deltaY > 10) {
        setIsLogOpen(true);
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Version Updater Hook (checks local version vs GitHub Releases)
  const {
    localVersion,
    release,
    isChecking: isCheckingVersion,
    hasUpdate,
    systemEnv,
    setSystemEnv,
    checkLatestVersion,
  } = useVersionUpdater(CURRENT_APP_VERSION);

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('workbuddy_accounts_data_v2', JSON.stringify(accounts));
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
    return (
      acc.id.toLowerCase().includes(q) ||
      acc.nickname.toLowerCase().includes(q) ||
      acc.region.toLowerCase().includes(q)
    );
  });

  // Add Log Helper
  const addLog = (level: ExecutionLog['level'], accountId: string, message: string) => {
    const newLog: ExecutionLog = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString('zh-CN'),
      accountId,
      level,
      message,
    };
    setLogs((prev) => [newLog, ...prev.slice(0, 120)]);
  };

  // Fetch real-time live points directly from official service (NEVER local arithmetic)
  const handleFetchLivePoints = async (account: WorkBuddyAccount, showLog = true): Promise<number | null> => {
    if (!account) return null;
    if (!account.credentials) {
      if (showLog) {
        addLog('warn', account.id, `[${account.id}] 尚未配置 Cookie/Token，请双击账号进行配置`);
      }
      return null;
    }

    setIsSyncingPoints(true);
    try {
      const summaryRes = await workbuddyRealApi.getResourceSummary(
        account.credentials,
        account.authType,
        account.extraHeaders
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
          const numericPoints = Number(liveCredit);
          const timeStr = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
          setAccounts((prev) =>
            prev.map((a) =>
              a.id === account.id
                ? {
                    ...a,
                    points: numericPoints,
                    status: '正常',
                    lastUpdated: timeStr,
                  }
                : a
            )
          );
          if (showLog) {
            addLog('success', account.id, `[${account.id}] 官方服务实时积分已同步：${numericPoints} 积分`);
          }
          return numericPoints;
        }
      }

      if (summaryRes.status === 401) {
        setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, status: '异常' } : a)));
        addLog('error', account.id, `[${account.id}] 官方服务鉴权 401 Unauthorized：Cookie 已失效，请双击账号更新`);
      }
      return null;
    } catch (err: unknown) {
      if (showLog) {
        addLog('warn', account.id, `[${account.id}] 调服务获取积分失败: ${err instanceof Error ? err.message : '网络错误'}`);
      }
      return null;
    } finally {
      setIsSyncingPoints(false);
    }
  };

  // Sync official tasks for an account
  const handleSyncOfficialTasks = async (account: WorkBuddyAccount, showLog = false) => {
    if (!account?.credentials) return;
    const tasksRes = await workbuddyRealApi.getGrowthTasks(
      account.credentials,
      account.authType,
      account.extraHeaders
    );
    if (tasksRes.ok && tasksRes.data) {
      const rawTasksList: WorkBuddyRawTask[] =
        tasksRes.data.data?.tasks || tasksRes.data.tasks || tasksRes.data.data || [];
      if (Array.isArray(rawTasksList) && rawTasksList.length > 0) {
        const mapped = rawTasksList.map((rt) => mapRawTaskToWorkBuddyTask(rt));
        setAccounts((prev) =>
          prev.map((a) => (a.id === account.id ? { ...a, tasks: mapped } : a))
        );
        if (showLog) {
          addLog('success', account.id, `[${account.id}] 已同步 ${mapped.length} 项官方最新任务进度`);
        }
      }
    }
  };

  // Add new account
  const handleAddAccount = (newAcc: WorkBuddyAccount) => {
    setAccounts((prev) => [newAcc, ...prev]);
    setSelectedAccountIds((prev) => [...prev, newAcc.id]);
    setCurrentAccountId(newAcc.id);
    addLog('success', newAcc.id, `成功添加账号 [${newAcc.id}] (${newAcc.region})`);
    if (newAcc.credentials) {
      handleFetchLivePoints(newAcc, true);
      handleSyncOfficialTasks(newAcc, true);
    }
  };

  // Save edited account (called from AccountEditModal)
  const handleSaveAccount = (updatedAcc: WorkBuddyAccount) => {
    setAccounts((prev) => prev.map((a) => (a.id === updatedAcc.id ? updatedAcc : a)));
    addLog('success', updatedAcc.id, `账号 [${updatedAcc.id}] 凭据与信息已成功更新并保存`);
    handleFetchLivePoints(updatedAcc, true);
    handleSyncOfficialTasks(updatedAcc, true);
  };

  // Delete selected accounts
  const handleDeleteSelectedAccounts = () => {
    if (selectedAccountIds.length === 0) return;
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    const count = selectedAccountIds.length;
    setAccounts((prev) => {
      const remaining = prev.filter((a) => !selectedAccountIds.includes(a.id));
      if (remaining.length > 0 && selectedAccountIds.includes(currentAccountId)) {
        setCurrentAccountId(remaining[0].id);
      }
      return remaining;
    });
    setSelectedAccountIds([]);
    setShowDeleteConfirm(false);
    addLog('warn', 'system', `已删除所选 ${count} 个账号`);
  };

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

  // Refresh all accounts status, tasks, and live points from server
  const handleRefreshAll = async () => {
    const timeStr = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    setStats((prev) => ({
      ...prev,
      lastRefreshed: timeStr,
    }));
    addLog('info', 'system', `开始批量同步全部 ${accounts.length} 个账号的官方实时积分与任务列表...`);

    for (const acc of accounts) {
      if (acc.credentials) {
        await handleFetchLivePoints(acc, false);
        await handleSyncOfficialTasks(acc, false);
      }
    }
    addLog('success', 'system', '全部账号官方实时积分与任务状态刷新完成');
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

  // Refresh Cat Travel Status for current account
  const handleRefreshCatTravelStatus = async () => {
    if (!currentAccount || isRunning) return;
    addLog('info', currentAccount.id, `[${currentAccount.id}] 正在查询猫猫旅行实时状态 (/status)...`);
    try {
      const res = await workbuddyRealApi.getCatTravelStatus(
        currentAccount.credentials,
        currentAccount.authType,
        currentAccount.extraHeaders
      );
      const timeStr = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      if (res.ok && res.data) {
        const t = res.data.data || res.data;
        const statusText = t.daily_limit_reached
          ? '今日已完成'
          : t.status === 'in_travel'
          ? '旅行中'
          : '待出发';

        setAccounts((prev) =>
          prev.map((a) =>
            a.id === currentAccount.id
              ? {
                  ...a,
                  catTravel: {
                    ...a.catTravel,
                    status: statusText,
                    statusUpdated: timeStr,
                    detailMessage: t.daily_limit_reached
                      ? '猫猫今日已完成旅行 (服务端标记 daily_limit_reached)'
                      : `旅行状态: ${statusText}`,
                  },
                }
              : a
          )
        );
        await handleFetchLivePoints(currentAccount, false);
        addLog('success', currentAccount.id, `[${currentAccount.id}] 猫猫旅行状态已更新：${statusText}`);
      } else {
        addLog('info', currentAccount.id, `[${currentAccount.id}] 猫猫状态已更新完成 (${timeStr})`);
      }
    } catch {
      addLog('warn', currentAccount.id, `[${currentAccount.id}] 猫猫状态查询未完成`);
    }
  };

  // Execute a single task & claim + refresh live points via API
  const handleExecuteAndClaimSingleTask = async (
    task: WorkBuddyTask
  ): Promise<{ ok: boolean; message: string; points?: number }> => {
    if (!currentAccount?.credentials) {
      return { ok: false, message: '请先双击左侧账号配置有效的 Cookie 或 cURL 凭据' };
    }

    const isClaimOnly = task.status === '待领奖' || (task.targetProgress > 0 && task.currentProgress >= task.targetProgress);
    addLog(
      'info',
      currentAccount.id,
      isClaimOnly
        ? `[${currentAccount.id}] 任务【${task.name}】已达标，正在直接自动领取奖励...`
        : `[${currentAccount.id}] 正在执行任务【${task.name}】并请求领奖...`
    );
    const pointsBefore = currentAccount.points;

    const execRes = await workbuddyRealApi.executeGrowthTask(
      task,
      currentAccount.credentials,
      currentAccount.authType,
      currentAccount.extraHeaders
    );

    // Always call official API to update live points & task status after execution
    const updatedPoints = await handleFetchLivePoints(currentAccount, false);
    await handleSyncOfficialTasks(currentAccount, false);

    const pointsAfter = updatedPoints ?? currentAccount.points;
    const gained = pointsAfter > pointsBefore;

    if (execRes.claimed || gained) {
      addLog(
        'success',
        currentAccount.id,
        `[${currentAccount.id}] 任务【${task.name}】完成并领奖！已调官方服务实时更新积分：${pointsAfter}`
      );
      return {
        ok: true,
        message: `任务完成并成功领取奖励！官方最新实时积分：${pointsAfter}`,
        points: pointsAfter,
      };
    }

    addLog(
      'warn',
      currentAccount.id,
      `[${currentAccount.id}] 任务【${task.name}】：${execRes.detail}（当前官方实时积分：${pointsAfter}）`
    );
    return {
      ok: false,
      message: `${execRes.detail}。当前实时积分：${pointsAfter}`,
      points: pointsAfter,
    };
  };

  // Execute All Daily Tasks
  const handleExecuteAllDaily = async () => {
    if (isRunning) return;
    const targetAccounts =
      executionScope === 'all'
        ? accounts
        : accounts.filter((a) => selectedAccountIds.includes(a.id));

    if (targetAccounts.length === 0) {
      addLog('warn', 'system', '请先勾选要执行任务的账号！');
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
          setLogs((prev) => [logItem, ...prev.slice(0, 120)]);
          setStats((prev) => ({
            ...prev,
            roundSuccess: delta.successes,
            roundFailed: delta.fails,
            skipped: delta.skips,
          }));

          // Merge updated accounts in real time (reflecting live API points after each task)
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

  // Execute Streak / Daily Check-in + live API points refresh
  const handleExecuteStreak = async () => {
    if (isRunning) return;
    const targetAccounts =
      executionScope === 'all'
        ? accounts
        : accounts.filter((a) => selectedAccountIds.includes(a.id));

    if (targetAccounts.length === 0) {
      addLog('warn', 'system', '请先勾选要签到/打卡的账号！');
      return;
    }

    setIsRunning(true);
    setRunningStatusText('正在执行签到与每日活跃...');
    addLog('info', 'system', `开始为 ${targetAccounts.length} 个账号执行签到打卡并同步实时积分`);

    for (const acc of targetAccounts) {
      try {
        const streakRes = await workbuddyRealApi.getDailyStreak(
          acc.credentials,
          acc.authType,
          acc.extraHeaders
        );
        const livePts = await handleFetchLivePoints(acc, false);
        if (streakRes.ok) {
          const days = streakRes.data?.data?.streak?.days || streakRes.data?.streak?.days || 1;
          addLog(
            'success',
            acc.id,
            `[${acc.id}] 每日活跃打卡完成 (连续活跃 ${days} 天，今日已达标 · 官方实时积分: ${livePts ?? acc.points})`
          );
        } else if (streakRes.status === 401) {
          addLog('error', acc.id, `[${acc.id}] 签到失败：Cookie 失效，请双击账号更新`);
        } else {
          addLog('info', acc.id, `[${acc.id}] 每日签到接口调用完成 (状态码: ${streakRes.status})`);
        }
      } catch {
        addLog('warn', acc.id, `[${acc.id}] 签到请求未完成`);
      }
    }

    setIsRunning(false);
    setRunningStatusText('签到完成');
  };

  // Complete & Claim Tasks (prioritize claiming already-completed tasks first, then run remaining pending tasks)
  const handleClaimCompletedTasks = async () => {
    if (isRunning) return;
    const targetAccounts =
      executionScope === 'all'
        ? accounts
        : accounts.filter((a) => selectedAccountIds.includes(a.id));

    if (targetAccounts.length === 0) {
      addLog('warn', 'system', '请先勾选要执行领奖的账号！');
      return;
    }

    setIsRunning(true);
    setRunningStatusText('正在领取已完成奖励并执行任务...');
    addLog('info', 'system', `开始为 ${targetAccounts.length} 个账号同步任务状态、优先领取已达标奖励并执行未完成任务`);

    for (const acc of targetAccounts) {
      if (!acc.credentials) {
        addLog('warn', acc.id, `[${acc.id}] 未配置凭据，已跳过`);
        continue;
      }

      // Refresh latest tasks from server first so any completed tasks get detected as 待领奖
      let latestTasks = acc.tasks;
      const tasksRes = await workbuddyRealApi
        .getGrowthTasks(acc.credentials, acc.authType, acc.extraHeaders)
        .catch(() => null);
      if (tasksRes?.ok && tasksRes.data) {
        const rawList: WorkBuddyRawTask[] =
          tasksRes.data.data?.tasks || tasksRes.data.tasks || tasksRes.data.data || [];
        if (Array.isArray(rawList) && rawList.length > 0) {
          latestTasks = rawList.map((rt) => mapRawTaskToWorkBuddyTask(rt));
          setAccounts((prev) => prev.map((a) => (a.id === acc.id ? { ...a, tasks: latestTasks } : a)));
        }
      }

      const readyToClaim = latestTasks.filter((t) => t.status === '待领奖');
      const otherPending = latestTasks.filter((t) => t.status !== '已领奖' && t.status !== '待领奖');
      const orderedTasks = [...readyToClaim, ...otherPending];

      for (const t of orderedTasks) {
        const ptsBefore = acc.points;
        const execRes = await workbuddyRealApi.executeGrowthTask(
          t,
          acc.credentials,
          acc.authType,
          acc.extraHeaders
        );
        // Real-time official API points update after EVERY task!
        const livePts = await handleFetchLivePoints(acc, false);
        if (execRes.claimed || (livePts !== null && livePts > ptsBefore)) {
          addLog(
            'success',
            acc.id,
            `[${acc.id}] 成功完成并领取「${t.name}」奖励 (+${t.reward}分)，实时总积分：${livePts ?? acc.points}`
          );
        } else {
          addLog('warn', acc.id, `[${acc.id}] 「${t.name}」未领奖：${execRes.detail}`);
        }
      }
      await handleSyncOfficialTasks(acc, false);
    }

    setIsRunning(false);
    setRunningStatusText('领奖执行完毕');
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
      const updated = await automationEngine.runCatTravelOnly(
        targetAccounts,
        (logItem, currentProgressAccounts) => {
          setLogs((prev) => [logItem, ...prev.slice(0, 120)]);
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
    <div className="h-full w-full bg-slate-900 flex flex-col font-sans select-none overflow-hidden">
      {/* 1. Window Title Bar & Header (Fixed Top) */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-slate-950/95 border-b border-slate-800">
        <div className="flex items-center gap-3">
          {/* WorkBuddy Custom App Icon */}
          <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white shadow-sm overflow-hidden shrink-0">
            <img
              src="./icon.png"
              alt="WorkBuddy"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <span className="text-xs font-bold font-mono">W</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-100 text-sm tracking-tight">WorkBuddy 自动化工具</span>

            {/* Version Badge & Red Dot Update Trigger */}
            <button
              type="button"
              onClick={() => setIsVersionModalOpen(true)}
              title="点击查看版本升级管理与下载对应系统安装包"
              className="relative inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-[11px] font-mono text-slate-300 transition-colors cursor-pointer"
            >
              <span>v{localVersion}</span>
              {hasUpdate ? (
                <span className="flex items-center gap-1 text-rose-400 font-sans font-medium">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping absolute -top-0.5 -right-0.5" />
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <span>可升级 {release?.tag_name}</span>
                </span>
              ) : (
                <ArrowUpCircle className="w-3 h-3 text-emerald-400" />
              )}
            </button>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsVersionModalOpen(true)}
            className="relative px-2.5 py-1 bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <ArrowUpCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>版本升级</span>
            {hasUpdate && (
              <span className="w-2 h-2 rounded-full bg-rose-500 ring-2 ring-slate-900" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsAddAccountOpen(true)}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
            <span>+ 添加账号</span>
          </button>

          <button
            type="button"
            onClick={handleRefreshAll}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
            <span>刷新全部</span>
          </button>
        </div>
      </div>

      {/* 2. Top Summary Metrics Strip (Fixed) */}
      <div className="shrink-0 px-5 py-2 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between text-xs font-mono text-slate-400">
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

      {/* 3. Main Workspace Grid: Left Sidebar + Right Workspace (Fills Remaining Height Without Outer Scroll) */}
      <div className="flex-1 min-h-0 grid grid-cols-12 overflow-hidden">
        {/* Left Column: Accounts List (3 cols) */}
        <div className="col-span-3 border-r border-slate-800 bg-slate-950/70 flex flex-col justify-between overflow-hidden">
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Search Input */}
            <div className="shrink-0 p-2.5 border-b border-slate-800">
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
            <div className="shrink-0 grid grid-cols-12 px-3 py-1.5 text-[11px] font-semibold text-slate-400 border-b border-slate-800 bg-slate-900/40">
              <span className="col-span-2">选择</span>
              <span className="col-span-5">账号</span>
              <span className="col-span-3">区域</span>
              <span className="col-span-2 text-right">状态</span>
            </div>

            {/* Double-Click Hint Bar */}
            <div className="shrink-0 px-3 py-1 bg-slate-900/70 border-b border-slate-800/80 text-[10px] text-slate-400 flex items-center justify-between">
              <span>💡 双击账号编辑信息与更新 Cookie</span>
              <span className="font-mono text-slate-500">{filteredAccounts.length} 个</span>
            </div>

            {/* Accounts Table Body (Scrollable internally) */}
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-800/40">
              {filteredAccounts.map((account) => {
                const isCurrent = account.id === currentAccountId;
                const isChecked = selectedAccountIds.includes(account.id);

                return (
                  <div
                    key={account.id}
                    onClick={() => setCurrentAccountId(account.id)}
                    onDoubleClick={() => setEditingAccount(account)}
                    title="单击切换选中，双击编辑账号与更新 Cookie"
                    className={`group grid grid-cols-12 px-3 py-2 text-xs items-center cursor-pointer transition-colors ${
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
                    <div className="col-span-5 font-mono truncate flex items-center justify-between pr-1" title={account.id}>
                      <span className="truncate">{account.nickname || account.id}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingAccount(account);
                        }}
                        title="编辑账号 / 更新 Cookie 凭据"
                        className="p-1 text-slate-500 hover:text-emerald-400 hover:bg-slate-700/60 rounded transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
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
                            : 'text-rose-400'
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
          <div className="shrink-0 p-2.5 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between text-xs">
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

        {/* Right Column: Account Workspace & Task Details (9 cols, Flex Column without Outer Scroll) */}
        <div className="col-span-9 p-4 flex flex-col justify-between gap-3 bg-slate-900/50 overflow-hidden">
          {currentAccount ? (
            <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
              {/* Account Header: ID, Region, Update time, Points */}
              <div className="shrink-0 flex items-center justify-between pb-2.5 border-b border-slate-800/80">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-100 font-mono tracking-tight">
                      {currentAccount.nickname || currentAccount.id}
                    </h2>
                    <span className="px-2 py-0.5 bg-slate-800 text-slate-300 border border-slate-700 rounded text-[11px]">
                      {currentAccount.region}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    更新于 {currentAccount.lastUpdated}
                  </div>
                </div>

                {/* Points Counter & Real-Time Live Sync Button */}
                <div className="flex items-center justify-end gap-2.5">
                  <div className="text-right">
                    <div className="text-2xl font-bold font-mono text-emerald-400 tracking-tight flex items-baseline justify-end gap-1">
                      <span>{currentAccount.points}</span>
                      <span className="text-xs text-slate-400 font-normal">积分</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleFetchLivePoints(currentAccount, true)}
                    disabled={isSyncingPoints}
                    title="调官方服务获取实时积分"
                    className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-slate-700"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncingPoints ? 'animate-spin text-emerald-400' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Feature Card 1: 猫猫旅行 (Cat Travel, Compact) */}
              <div className="shrink-0 px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🐱</span>
                    <span className="font-semibold text-slate-100 text-xs">猫猫旅行</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        currentAccount.catTravel.status === '今日已完成'
                          ? 'bg-slate-800 text-emerald-400 border border-emerald-500/30'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {currentAccount.catTravel.status}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono ml-1">
                      更新于 {currentAccount.catTravel.statusUpdated}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleCatAutoTravel}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                        currentAccount.catTravel.autoTravel
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                      }`}
                    >
                      <span>{currentAccount.catTravel.autoTravel ? '☑ 自动旅行' : '☐ 自动旅行'}</span>
                    </button>
                    <button
                      onClick={handleRefreshCatTravelStatus}
                      disabled={isRunning}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] rounded border border-slate-700 transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3 text-slate-400" />
                      <span>刷新状态</span>
                    </button>
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 font-mono flex flex-wrap items-center justify-between gap-2">
                  <span className="text-slate-300">{currentAccount.catTravel.detailMessage}</span>
                  <span className="text-slate-400">最近结果: {currentAccount.catTravel.lastResult}</span>
                </div>
              </div>

              {/* Feature Card 2: 任务明细 (Task Breakdown, Fills Remaining Space & Scrolls Internally) */}
              <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden">
                <div className="shrink-0 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-200 text-xs">任务明细</h3>
                    <span className="text-[11px] text-slate-400">
                      (点击任意任务右侧「执行/辅助」可查看具体完成步骤或单点领奖)
                    </span>
                  </div>

                  {/* Filter tabs: 全部 | 未完成 | 已领奖 */}
                  <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                    {(['全部', '未完成', '已领奖'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setTaskFilter(tab)}
                        className={`px-2.5 py-0.5 rounded transition-colors cursor-pointer ${
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
                <div className="flex-1 min-h-0 border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60 flex flex-col">
                  <div className="shrink-0 grid grid-cols-12 px-3 py-1.5 text-[11px] font-semibold text-slate-400 bg-slate-900/70 border-b border-slate-800">
                    <span className="col-span-3">名称</span>
                    <span className="col-span-1">状态</span>
                    <span className="col-span-1">进度</span>
                    <span className="col-span-1">奖励</span>
                    <span className="col-span-2">最近结果</span>
                    <span className="col-span-3">完成方案 / 原因</span>
                    <span className="col-span-1 text-right">操作</span>
                  </div>

                  <div className="flex-1 min-h-0 divide-y divide-slate-800/40 overflow-y-auto">
                    {displayedTasks.map((rawTask) => {
                      const task = sanitizeTaskProgress(rawTask);
                      const isSelected = selectedTaskId === task.id;
                      const isWeChatTask = task.name.includes('公众号');
                      const isRowExecuting = executingTaskId === task.id;

                      return (
                        <div
                          key={task.id}
                          onClick={() => setSelectedTaskId(task.id)}
                          onDoubleClick={() => setAssistingTask(task)}
                          className={`grid grid-cols-12 px-3 py-1.5 text-xs items-center cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-emerald-950/30 border-l-2 border-emerald-500 text-white'
                              : 'text-slate-300 hover:bg-slate-900/60'
                          }`}
                        >
                          <span className="col-span-3 font-medium truncate pr-2" title={task.name}>
                            {task.name}
                          </span>
                          <span className="col-span-1">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                                task.status === '已领奖'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : task.status === '待领奖'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 animate-pulse'
                                  : task.status === '需等待'
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : task.status === '需人工'
                                  ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                                  : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                              }`}
                            >
                              {task.status}
                            </span>
                          </span>
                          <span className="col-span-1 font-mono text-[11px] text-slate-400">
                            {task.currentProgress}/{task.targetProgress}
                          </span>
                          <span className="col-span-1 font-mono text-[11px] text-emerald-400 whitespace-nowrap">
                            {task.reward} 分
                          </span>
                          <span className="col-span-2 text-[11px] text-slate-400 truncate pr-2" title={task.recentResult}>
                            {task.recentResult || '-'}
                          </span>
                          <span className="col-span-3 text-[11px] text-slate-400 truncate pr-2" title={task.reason}>
                            {task.reason || '-'}
                          </span>
                          <div className="col-span-1 text-right">
                            <button
                              type="button"
                              disabled={isRowExecuting}
                              onClick={async (e) => {
                                e.stopPropagation();
                                setSelectedTaskId(task.id);
                                if ((isWeChatTask && task.status !== '待领奖') || task.status === '已领奖') {
                                  setAssistingTask(task);
                                  return;
                                }
                                setExecutingTaskId(task.id);
                                try {
                                  await handleExecuteAndClaimSingleTask(task);
                                } finally {
                                  setExecutingTaskId(null);
                                }
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1 ${
                                task.status === '已领奖'
                                  ? 'bg-slate-800/70 text-slate-400 hover:text-slate-200'
                                  : task.status === '待领奖'
                                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                                  : isWeChatTask
                                  ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30'
                                  : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30'
                              }`}
                            >
                              {isRowExecuting ? (
                                <>
                                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                  <span>{task.status === '待领奖' ? '领奖中' : '执行中'}</span>
                                </>
                              ) : task.status === '已领奖' ? (
                                <span>详情</span>
                              ) : task.status === '待领奖' ? (
                                <>
                                  <Gift className="w-2.5 h-2.5" />
                                  <span>立即领奖</span>
                                </>
                              ) : isWeChatTask ? (
                                <>
                                  <QrCode className="w-2.5 h-2.5" />
                                  <span>扫码关注</span>
                                </>
                              ) : (
                                <span>一键完成</span>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Task Detail Inspector (Compact Fixed Strip) */}
              <div className="shrink-0 px-3 py-2 bg-slate-950 rounded-xl border border-slate-800/90 text-xs flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="text-slate-400 text-[11px] truncate">
                    最近结果：
                    <strong className="text-slate-200">
                      {selectedTask ? `(${selectedTask.name}) ${selectedTask.recentResult}` : '(未选中任务)'}
                    </strong>
                  </div>
                  <div className="text-slate-400 text-[11px] truncate">
                    方案与原因：
                    <span className="text-slate-300 select-all font-mono ml-1">
                      {selectedTask ? selectedTask.reason : '点击任意一行任务，可在此查看官方要求或点击右侧「打开完成助手」'}
                    </span>
                  </div>
                </div>

                {selectedTask && (
                  <div className="shrink-0 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => copyDetailText(selectedTask.reason)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 flex items-center gap-1 text-[11px] transition-colors cursor-pointer"
                    >
                      {copiedDetail ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedDetail ? '已复制' : '复制要求'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssistingTask(selectedTask)}
                      className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg flex items-center gap-1 text-[11px] font-medium transition-colors cursor-pointer"
                    >
                      <Wrench className="w-3 h-3" />
                      <span>打开完成助手</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-slate-500 space-y-2">
              <Layers className="w-8 h-8 opacity-40" />
              <span>暂无选中的账号，请在左侧选择或点击“+ 添加账号”</span>
            </div>
          )}

          {/* 4. Bottom Execution Toolbar (Single-line nowrap guaranteed) */}
          <div className="shrink-0 pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 overflow-x-auto">
            {/* Left radio scope options */}
            <div className="flex items-center gap-2.5 text-xs text-slate-300 shrink-0 whitespace-nowrap">
              <label className="inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0">
                <input
                  type="radio"
                  name="executionScope"
                  checked={executionScope === 'all'}
                  onChange={() => setExecutionScope('all')}
                  className="text-emerald-500 focus:ring-emerald-500"
                />
                <span>全部账号</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0">
                <input
                  type="radio"
                  name="executionScope"
                  checked={executionScope === 'selected'}
                  onChange={() => setExecutionScope('selected')}
                  className="text-emerald-500 focus:ring-emerald-500"
                />
                <span>所选账号 ({selectedAccountIds.length})</span>
              </label>
              <span className="text-[11px] text-slate-400 font-mono ml-1 whitespace-nowrap truncate max-w-[160px]" title={runningStatusText}>
                {runningStatusText}
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
              <button
                onClick={handleExecuteAllDaily}
                disabled={isRunning}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
              >
                {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <Play className="w-3.5 h-3.5 fill-current shrink-0" />}
                <span>一键执行全部日常</span>
              </button>

              <button
                onClick={handleExecuteStreak}
                disabled={isRunning}
                className="px-2.5 py-1.5 bg-emerald-700/80 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg shadow-sm flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
              >
                <CalendarCheck className="w-3.5 h-3.5 shrink-0" />
                <span>签到 / 每日活跃</span>
              </button>

              <button
                onClick={handleExecuteCatTravel}
                disabled={isRunning}
                className="px-2.5 py-1.5 bg-emerald-700/80 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg shadow-sm flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Compass className="w-3.5 h-3.5 shrink-0" />
                <span>一键猫猫旅行</span>
              </button>

              <button
                onClick={handleClaimCompletedTasks}
                disabled={isRunning}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg border border-slate-700 transition-colors disabled:opacity-40 cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Gift className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>完成任务并领奖</span>
              </button>

              {isRunning && (
                <button
                  onClick={handleCancelExecution}
                  className="px-2.5 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 text-xs rounded-lg border border-rose-500/30 transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <XCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>取消</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 5. Bottom Logs Drawer (Closed by Default, Manually Resizable via Top Drag Bar) */}
      <div
        style={{ height: isLogOpen ? `${logHeight}px` : '28px' }}
        className="shrink-0 bg-slate-950 border-t border-slate-800 flex flex-col overflow-hidden transition-[height] duration-75"
      >
        {/* Top Drag Handle for Manual Height Resizing */}
        <div
          onMouseDown={handleStartResizeLog}
          title="上下拖动可自由调节日志控制台高度"
          className="h-1.5 w-full cursor-ns-resize bg-slate-900 hover:bg-emerald-500/40 transition-colors flex items-center justify-center shrink-0"
        >
          <div className="w-8 h-0.5 rounded-full bg-slate-700" />
        </div>

        {/* Log Header Bar */}
        <div
          onClick={() => setIsLogOpen((prev) => !prev)}
          className="shrink-0 px-4 py-0.5 border-b border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400 cursor-pointer hover:bg-slate-900/60 select-none"
        >
          <div className="truncate flex items-center gap-2">
            <span className="text-emerald-400 font-semibold">日志控制台 ({logs.length})</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-200 truncate">{logs[0]?.message || '等待任务开始...'}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0 ml-2">
            {isLogOpen && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLogs([]);
                }}
                className="text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
              >
                清空
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsLogOpen((prev) => !prev);
              }}
              className="text-slate-400 hover:text-emerald-400 flex items-center gap-1 cursor-pointer"
            >
              <span>{isLogOpen ? '收起' : '展开'}</span>
              {isLogOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Log Content Body */}
        {isLogOpen && (
          <div className="flex-1 min-h-0 px-4 py-1.5 overflow-y-auto font-mono text-[11px] space-y-1">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                <span className="text-slate-600 shrink-0">{log.timestamp}</span>
                <span
                  className={
                    log.level === 'success'
                      ? 'text-emerald-400'
                      : log.level === 'warn'
                      ? 'text-amber-400'
                      : log.level === 'error'
                      ? 'text-rose-400'
                      : 'text-slate-300'
                  }
                >
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Account Modal */}
      <AddAccountModal
        isOpen={isAddAccountOpen}
        onClose={() => setIsAddAccountOpen(false)}
        onAdd={handleAddAccount}
      />

      {/* Double-click Edit Account Modal */}
      <AccountEditModal
        isOpen={Boolean(editingAccount)}
        account={editingAccount}
        onClose={() => setEditingAccount(null)}
        onSave={handleSaveAccount}
      />

      {/* Version Update Manager Modal */}
      <VersionUpdateModal
        isOpen={isVersionModalOpen}
        onClose={() => setIsVersionModalOpen(false)}
        localVersion={localVersion}
        release={release}
        hasUpdate={hasUpdate}
        isChecking={isCheckingVersion}
        systemEnv={systemEnv}
        onCheckUpdate={checkLatestVersion}
        onChangeEnv={setSystemEnv}
      />

      {/* Single Task Quick Complete & Assist Modal */}
      <TaskAssistModal
        isOpen={Boolean(assistingTask)}
        task={assistingTask}
        onClose={() => setAssistingTask(null)}
        onExecuteAndClaim={handleExecuteAndClaimSingleTask}
      />

      {/* Delete Selected Accounts Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2 bg-rose-500/10 rounded-xl border border-rose-500/20">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-sm text-slate-100">确认删除所选账号</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              确定要删除当前勾选的 <strong className="text-rose-400 font-mono">{selectedAccountIds.length}</strong> 个账号吗？删除后可通过右上角「+ 添加账号」重新录入。
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs rounded-xl shadow-md transition-colors cursor-pointer"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
