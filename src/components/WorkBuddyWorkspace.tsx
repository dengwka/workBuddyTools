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
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  WifiOff,
  Lock,
  Minus,
  Maximize2,
  Minimize2,
  X,
} from 'lucide-react';
import {
  WorkBuddyAccount,
  WorkBuddyTask,
  ExecutionLog,
  SystemExecutionStats,
  LicenseValidationState,
} from '../types/workbuddy';
import { INITIAL_ACCOUNTS } from '../utils/initialData';
import { automationEngine } from '../utils/automationEngine';
import {
  workbuddyRealApi,
  WorkBuddyRawTask,
  mapRawTaskToWorkBuddyTask,
  sanitizeTaskProgress,
  roundPoints,
  formatAccountLabel,
} from '../utils/workbuddyRealApi';
import {
  DEFAULT_APP_TYPE,
  GRACE_RETRY_INTERVAL_MS,
  HEARTBEAT_INTERVAL_MS,
  OFFLINE_GRACE_MAX_MS,
  activateOnlineLicense,
  buildUnlicensedState,
  clearStoredLicense,
  computeRemainingDays,
  getMachineLicenseContext,
  parseExpireTimeMs,
  verifyOfflineLicenseFile,
  verifyStoredLicense,
} from '../utils/licenseService';
import { AddAccountModal } from './AddAccountModal';
import { AccountEditModal } from './AccountEditModal';
import {
  VersionUpdateModal,
  useVersionUpdater,
  CURRENT_APP_VERSION,
} from './VersionUpdateModal';
import { TaskAssistModal } from './TaskAssistModal';
import { LicenseModal } from './LicenseModal';

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
            points: roundPoints(acc.points),
            tasks: Array.isArray(acc.tasks)
              ? acc.tasks.map((t) => sanitizeTaskProgress(t))
              : [],
          }));
        }
      }
    } catch {
      // fallback
    }
    return INITIAL_ACCOUNTS.map((acc) => ({ ...acc, points: roundPoints(acc.points) }));
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

  // Execution scope radio: default strictly to 'selected' so unchecked accounts are never executed
  const [executionScope, setExecutionScope] = useState<'all' | 'selected'>('selected');

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
      message: `${
        accounts[0]
          ? `[操作账号: ${formatAccountLabel(accounts[0].id, accounts[0].nickname)}]`
          : '[系统]'
      } 工作台就绪 (已启用账号隔离与权限控制：仅执行已勾选账号，双击账号可编辑 Cookie / cURL)`,
    },
  ]);

  // Modals & Popups
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<WorkBuddyAccount | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSyncingPoints, setIsSyncingPoints] = useState(false);
  const [copiedDetail, setCopiedDetail] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [logViewScope, setLogViewScope] = useState<'current' | 'all'>('current');
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [assistingTask, setAssistingTask] = useState<WorkBuddyTask | null>(null);
  const [executingTaskId, setExecutingTaskId] = useState<string | null>(null);

  // License Authorization State (Installation/startup skippable, business ops gated)
  const [licenseState, setLicenseState] = useState<LicenseValidationState>(() =>
    buildUnlicensedState('', [])
  );
  const [isLicenseBusy, setIsLicenseBusy] = useState(false);
  const [isLicenseModalOpen, setIsLicenseModalOpen] = useState(false);
  const [licenseBannerDismissed, setLicenseBannerDismissed] = useState(false);

  // Electron frameless window state & controls
  const electronWindowApi =
    typeof window !== 'undefined'
      ? (
          window as unknown as {
            electronAPI?: {
              isElectron?: boolean;
              windowMinimize?: () => Promise<void>;
              windowToggleMaximize?: () => Promise<boolean>;
              windowIsMaximized?: () => Promise<boolean>;
              windowClose?: () => Promise<void>;
              onWindowMaximizedChanged?: (cb: (isMax: boolean) => void) => () => void;
            };
          }
        ).electronAPI
      : undefined;
  const isElectronApp = Boolean(electronWindowApi?.isElectron);
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);

  useEffect(() => {
    if (!electronWindowApi?.isElectron) return;
    let unsub: (() => void) | undefined;
    electronWindowApi.windowIsMaximized?.().then((v) => setIsWindowMaximized(Boolean(v))).catch(() => {});
    if (electronWindowApi.onWindowMaximizedChanged) {
      unsub = electronWindowApi.onWindowMaximizedChanged((v) => setIsWindowMaximized(Boolean(v)));
    }
    return () => {
      unsub?.();
    };
  }, [electronWindowApi]);

  const handleWindowMinimize = () => {
    electronWindowApi?.windowMinimize?.();
  };

  const handleWindowToggleMaximize = async () => {
    const next = await electronWindowApi?.windowToggleMaximize?.();
    if (typeof next === 'boolean') {
      setIsWindowMaximized(next);
    }
  };

  const handleWindowClose = () => {
    electronWindowApi?.windowClose?.();
  };

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
    hasChecked: hasCheckedVersion,
    checkError: checkVersionError,
    systemEnv,
    setSystemEnv,
    checkLatestVersion,
  } = useVersionUpdater(CURRENT_APP_VERSION);

  const handleOpenVersionModal = () => {
    setIsVersionModalOpen(true);
    checkLatestVersion();
  };

  // License startup validation + 24h heartbeat + non-blocking external network grace fallback
  useEffect(() => {
    let cancelled = false;

    const initLicense = async () => {
      const ctx = await getMachineLicenseContext();
      if (cancelled) return;

      const saved = ctx.savedLicense;
      if (!saved || !saved.licenseKey) {
        setLicenseState(buildUnlicensedState(ctx.macAddress, ctx.allMacs));
        return;
      }

      // 1. Check local expiration first without waiting on external server
      const expireMs = parseExpireTimeMs(saved.expireTime);
      if (expireMs !== null && expireMs <= Date.now()) {
        setLicenseState({
          status: 'expired',
          isAuthorized: false,
          code: 'EXPIRED',
          message: `授权已于 ${saved.expireTime} 到期，请续期或更换新的授权码`,
          remainingDays: 0,
          expireTime: saved.expireTime,
          appType: saved.appType || DEFAULT_APP_TYPE,
          appName: saved.appName || 'workBuddy助手',
          macAddress: saved.macAddress || ctx.macAddress,
          allMacs: ctx.allMacs,
          licenseKey: saved.licenseKey,
          lastVerifiedAt: saved.lastVerifiedAt,
          isOfflineGrace: false,
        });
        return;
      }

      // 2. Optimistically allow cached authorization while external server check runs silently in background
      const cachedDays = computeRemainingDays(saved.expireTime, saved.remainingDays);
      const lastOkMs = saved.lastVerifiedAt ? Date.parse(saved.lastVerifiedAt) : null;
      const withinGrace =
        lastOkMs !== null && !Number.isNaN(lastOkMs) && Date.now() - lastOkMs <= OFFLINE_GRACE_MAX_MS;

      if (withinGrace && (cachedDays === null || cachedDays > 0)) {
        setLicenseState({
          status: 'valid',
          isAuthorized: true,
          code: 'CACHED_VALID',
          message: `已加载本地授权缓存（剩余 ${cachedDays ?? '--'} 天），正在后台联网同步最新状态...`,
          remainingDays: cachedDays,
          expireTime: saved.expireTime,
          appType: saved.appType || DEFAULT_APP_TYPE,
          appName: saved.appName || 'workBuddy助手',
          macAddress: saved.macAddress || ctx.macAddress,
          allMacs: ctx.allMacs,
          licenseKey: saved.licenseKey,
          lastVerifiedAt: saved.lastVerifiedAt,
          isOfflineGrace: false,
        });
      } else {
        setLicenseState({
          ...buildUnlicensedState(ctx.macAddress, ctx.allMacs),
          status: 'checking',
          message: '正在向授权服务器校验当前 License...',
          licenseKey: saved.licenseKey,
          appType: saved.appType || DEFAULT_APP_TYPE,
        });
      }

      const verified = await verifyStoredLicense();
      if (!cancelled) {
        setLicenseState(verified);
      }
    };

    initLicense();

    const heartbeatTimer = window.setInterval(async () => {
      const next = await verifyStoredLicense();
      if (!cancelled && next.licenseKey) {
        setLicenseState(next);
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(heartbeatTimer);
    };
  }, []);

  // Silent retry every 30 min when in weak-network grace_offline mode
  useEffect(() => {
    if (licenseState.status !== 'grace_offline') return;
    let cancelled = false;
    const retryTimer = window.setInterval(async () => {
      const next = await verifyStoredLicense();
      if (!cancelled) {
        setLicenseState(next);
      }
    }, GRACE_RETRY_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(retryTimer);
    };
  }, [licenseState.status]);

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

  // Clear stale task selection when switching accounts to prevent cross-account bleed
  useEffect(() => {
    setSelectedTaskId(null);
  }, [currentAccountId]);

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
    setLogs((prev) => [newLog, ...prev.slice(0, 300)]);
  };

  // Fetch real-time live points directly from official service (NEVER local arithmetic)
  const handleFetchLivePoints = async (account: WorkBuddyAccount, showLog = true): Promise<number | null> => {
    if (!account) return null;
    const accPrefix = `[操作账号: ${formatAccountLabel(account.id, account.nickname)}]`;
    if (!account.credentials) {
      if (showLog) {
        addLog('warn', account.id, `${accPrefix} 尚未配置 Cookie/Token，请双击账号进行配置`);
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
          const numericPoints = roundPoints(liveCredit);
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
            addLog('success', account.id, `${accPrefix} 官方服务实时积分已同步：${numericPoints} 积分`);
          }
          return numericPoints;
        }
      }

      if (summaryRes.status === 401) {
        setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, status: '异常' } : a)));
        addLog('error', account.id, `${accPrefix} 官方服务鉴权 401 Unauthorized：Cookie 已失效，请双击账号更新`);
      }
      return null;
    } catch (err: unknown) {
      if (showLog) {
        addLog('warn', account.id, `${accPrefix} 调服务获取积分失败: ${err instanceof Error ? err.message : '网络错误'}`);
      }
      return null;
    } finally {
      setIsSyncingPoints(false);
    }
  };

  // Sync official tasks for an account
  const handleSyncOfficialTasks = async (account: WorkBuddyAccount, showLog = false) => {
    if (!account?.credentials) return;
    const accPrefix = `[操作账号: ${formatAccountLabel(account.id, account.nickname)}]`;
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
          addLog('success', account.id, `${accPrefix} 已同步 ${mapped.length} 项官方最新任务进度`);
        }
      }
    }
  };

  // Add new account
  const handleAddAccount = (newAcc: WorkBuddyAccount) => {
    const normalizedAcc: WorkBuddyAccount = {
      ...newAcc,
      points: roundPoints(newAcc.points),
    };
    setAccounts((prev) => [normalizedAcc, ...prev]);
    setSelectedAccountIds((prev) => [...prev, normalizedAcc.id]);
    setCurrentAccountId(normalizedAcc.id);
    addLog(
      'success',
      normalizedAcc.id,
      `[操作账号: ${formatAccountLabel(normalizedAcc.id, normalizedAcc.nickname)}] 成功添加账号 (${normalizedAcc.region})`
    );
    if (normalizedAcc.credentials) {
      handleFetchLivePoints(normalizedAcc, true);
      handleSyncOfficialTasks(normalizedAcc, true);
    }
  };

  // Save edited account (called from AccountEditModal)
  const handleSaveAccount = (updatedAcc: WorkBuddyAccount) => {
    const normalizedAcc: WorkBuddyAccount = {
      ...updatedAcc,
      points: roundPoints(updatedAcc.points),
    };
    setAccounts((prev) => prev.map((a) => (a.id === normalizedAcc.id ? normalizedAcc : a)));
    addLog(
      'success',
      normalizedAcc.id,
      `[操作账号: ${formatAccountLabel(normalizedAcc.id, normalizedAcc.nickname)}] 凭据与信息已成功更新并保存`
    );
    handleFetchLivePoints(normalizedAcc, true);
    handleSyncOfficialTasks(normalizedAcc, true);
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
    addLog('warn', 'system', `[系统] 已删除所选 ${count} 个账号`);
  };

  const handleSelectAll = () => {
    setExecutionScope('selected');
    if (selectedAccountIds.length === filteredAccounts.length) {
      setSelectedAccountIds([]);
    } else {
      setSelectedAccountIds(filteredAccounts.map((a) => a.id));
    }
  };

  const handleInverseSelect = () => {
    setExecutionScope('selected');
    const newSelected = filteredAccounts
      .map((a) => a.id)
      .filter((id) => !selectedAccountIds.includes(id));
    setSelectedAccountIds(newSelected);
  };

  const toggleSelectAccount = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExecutionScope('selected');
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // License Actions & Business Gate Helper
  const ensureLicenseAuthorized = (actionLabel: string): boolean => {
    if (licenseState.isAuthorized) return true;
    addLog(
      'error',
      currentAccount?.id || 'system',
      `[License 校验拦截] 无法执行「${actionLabel}」：${licenseState.message}`
    );
    setRunningStatusText('未授权已锁定');
    setLicenseBannerDismissed(false);
    setIsLicenseModalOpen(true);
    return false;
  };

  const handleActivateLicenseOnline = async (
    licenseKey: string,
    appType: string,
    proxyUrl?: string
  ) => {
    setIsLicenseBusy(true);
    try {
      const res = await activateOnlineLicense({ licenseKey, appType, proxyUrl });
      setLicenseState(res);
      setLicenseBannerDismissed(false);
      addLog(
        res.isAuthorized ? 'success' : 'error',
        currentAccount?.id || 'system',
        `[License 激活] ${res.message} (MAC=${res.macAddress})`
      );
    } finally {
      setIsLicenseBusy(false);
    }
  };

  const handleVerifyOfflineLic = async (
    licJson: Record<string, unknown>,
    appType: string,
    proxyUrl?: string
  ) => {
    setIsLicenseBusy(true);
    try {
      const res = await verifyOfflineLicenseFile({ licJson, appType, proxyUrl });
      setLicenseState(res);
      setLicenseBannerDismissed(false);
      addLog(
        res.isAuthorized ? 'success' : 'error',
        currentAccount?.id || 'system',
        `[License 离线验签] ${res.message} (MAC=${res.macAddress})`
      );
    } finally {
      setIsLicenseBusy(false);
    }
  };

  const handleManualVerifyLicense = async (proxyUrl?: string) => {
    setIsLicenseBusy(true);
    try {
      const res = await verifyStoredLicense({ proxyUrl });
      setLicenseState(res);
      addLog(
        res.isAuthorized ? (res.status === 'grace_offline' ? 'warn' : 'success') : 'error',
        currentAccount?.id || 'system',
        `[License 心跳校验] ${res.message}${
          res.remainingDays !== null ? ` (剩余 ${res.remainingDays} 天)` : ''
        }`
      );
    } finally {
      setIsLicenseBusy(false);
    }
  };

  const handleClearLicense = async () => {
    setIsLicenseBusy(true);
    try {
      const cleared = await clearStoredLicense();
      setLicenseState(cleared);
      setLicenseBannerDismissed(false);
      addLog('warn', currentAccount?.id || 'system', '[License] 已清除本地授权配置，核心业务已锁定');
    } finally {
      setIsLicenseBusy(false);
    }
  };

  // Refresh all accounts status, tasks, and live points from server
  const handleRefreshAll = async () => {
    if (!ensureLicenseAuthorized('刷新全部')) return;
    const timeStr = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    setStats((prev) => ({
      ...prev,
      lastRefreshed: timeStr,
    }));
    addLog('info', 'system', `[系统] 开始批量同步全部 ${accounts.length} 个账号的官方实时积分与任务列表...`);

    for (const acc of accounts) {
      if (acc.credentials) {
        await handleFetchLivePoints(acc, false);
        await handleSyncOfficialTasks(acc, false);
      }
    }
    addLog('success', 'system', '[系统] 全部账号官方实时积分与任务状态刷新完成');
  };

  // Toggle Cat Auto-Travel
  const toggleCatAutoTravel = () => {
    if (!currentAccount) return;
    if (!ensureLicenseAuthorized('切换自动旅行')) return;
    const accPrefix = `[操作账号: ${formatAccountLabel(currentAccount.id, currentAccount.nickname)}]`;
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
      `${accPrefix} ${!currentAccount.catTravel.autoTravel ? '已开启自动旅行' : '已关闭自动旅行'}`
    );
  };

  // Refresh Cat Travel Status for current account
  const handleRefreshCatTravelStatus = async () => {
    if (!currentAccount || isRunning) return;
    if (!ensureLicenseAuthorized('猫猫旅行刷新状态')) return;
    const accPrefix = `[操作账号: ${formatAccountLabel(currentAccount.id, currentAccount.nickname)}]`;
    addLog('info', currentAccount.id, `${accPrefix} 正在查询猫猫旅行实时状态 (/status)...`);
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
        addLog('success', currentAccount.id, `${accPrefix} 猫猫旅行状态已更新：${statusText}`);
      } else {
        addLog('info', currentAccount.id, `${accPrefix} 猫猫状态已更新完成 (${timeStr})`);
      }
    } catch {
      addLog('warn', currentAccount.id, `${accPrefix} 猫猫状态查询未完成`);
    }
  };

  // Execute a single task & claim + refresh live points via API
  const handleExecuteAndClaimSingleTask = async (
    task: WorkBuddyTask
  ): Promise<{ ok: boolean; message: string; points?: number }> => {
    if (!ensureLicenseAuthorized(`执行任务「${task.name}」`)) {
      return { ok: false, message: licenseState.message };
    }
    if (!currentAccount?.credentials) {
      return { ok: false, message: '请先双击左侧账号配置有效的 Cookie 或 cURL 凭据' };
    }

    const accPrefix = `[操作账号: ${formatAccountLabel(currentAccount.id, currentAccount.nickname)}]`;
    const isClaimOnly = task.status === '待领奖' || (task.targetProgress > 0 && task.currentProgress >= task.targetProgress);
    addLog(
      'info',
      currentAccount.id,
      isClaimOnly
        ? `${accPrefix} 任务【${task.name}】已达标，正在直接自动领取奖励...`
        : `${accPrefix} 正在执行任务【${task.name}】并请求领奖...`
    );
    const pointsBefore = roundPoints(currentAccount.points);

    const execRes = await workbuddyRealApi.executeGrowthTask(
      task,
      currentAccount.credentials,
      currentAccount.authType,
      currentAccount.extraHeaders,
      (level, msg) => addLog(level, currentAccount.id, `${accPrefix} [${task.name}] ${msg}`)
    );

    // Wait briefly so billing ledger reflects claimed reward, then sync live points & task status
    await new Promise((r) => setTimeout(r, 450));
    const updatedPoints = await handleFetchLivePoints(currentAccount, false);
    await handleSyncOfficialTasks(currentAccount, false);

    const pointsAfter = roundPoints(updatedPoints ?? pointsBefore);
    const gained = pointsAfter > pointsBefore;

    if (execRes.claimed || gained) {
      addLog(
        'success',
        currentAccount.id,
        `${accPrefix} 任务【${task.name}】完成并领奖！已调官方服务实时更新积分：${pointsAfter}`
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
      `${accPrefix} 任务【${task.name}】：${execRes.detail}（当前官方实时积分：${pointsAfter}）`
    );
    return {
      ok: false,
      message: `${execRes.detail}。当前实时积分：${pointsAfter}`,
      points: pointsAfter,
    };
  };

  // Resolve strict target accounts according to permission control scope
  const getTargetAccountsWithPermissionCheck = (actionLabel: string): WorkBuddyAccount[] => {
    if (executionScope === 'selected') {
      const selected = accounts.filter((a) => selectedAccountIds.includes(a.id));
      if (selected.length === 0) {
        addLog('warn', currentAccount?.id || 'system', `[权限控制] 未勾选任何账号，已阻止执行「${actionLabel}」！请在左侧勾选目标账号`);
        setRunningStatusText('请先勾选账号');
        return [];
      }
      const labels = selected.map((a) => formatAccountLabel(a.id, a.nickname)).join('、');
      addLog(
        'info',
        selected[0].id,
        `[权限控制] 仅执行已勾选的 ${selected.length} 个账号：${labels}（其余未勾选账号已严格隔离跳过）`
      );
      return selected;
    }

    if (accounts.length === 0) {
      addLog('warn', 'system', `[权限控制] 当前账号列表为空，无法执行「${actionLabel}」`);
      return [];
    }

    addLog(
      'info',
      currentAccount?.id || accounts[0].id,
      `[权限控制] 当前选择「全部账号」，将依次执行共 ${accounts.length} 个账号`
    );
    return accounts;
  };

  // Execute All Daily Tasks
  const handleExecuteAllDaily = async () => {
    if (isRunning) return;
    if (!ensureLicenseAuthorized('一键执行全部日常')) return;
    const targetAccounts = getTargetAccountsWithPermissionCheck('一键执行全部日常');
    if (targetAccounts.length === 0) return;

    setIsRunning(true);
    setRunningStatusText(`正在执行 (${targetAccounts.length}个账号)...`);
    setStats((prev) => ({
      ...prev,
      running: targetAccounts.length,
      queued: 0,
    }));

    try {
      const updated = await automationEngine.runDailyTasks(
        targetAccounts,
        (logItem, currentProgressAccounts, delta) => {
          setLogs((prev) => [logItem, ...prev.slice(0, 300)]);
          setStats((prev) => ({
            ...prev,
            roundSuccess: delta.successes,
            roundFailed: delta.fails,
            skipped: delta.skips,
          }));

          // Merge ONLY target accounts in real time (preserving strict account isolation)
          setAccounts((prev) =>
            prev.map((acc) => {
              const found = currentProgressAccounts.find((p) => p.id === acc.id);
              return found ? { ...found, points: roundPoints(found.points) } : acc;
            })
          );
        }
      );

      setAccounts((prev) =>
        prev.map((acc) => {
          const found = updated.find((u) => u.id === acc.id);
          return found ? { ...found, points: roundPoints(found.points) } : acc;
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
    if (!ensureLicenseAuthorized('签到 / 每日活跃')) return;
    const targetAccounts = getTargetAccountsWithPermissionCheck('签到 / 每日活跃');
    if (targetAccounts.length === 0) return;

    setIsRunning(true);
    setRunningStatusText('正在执行签到与每日活跃...');

    for (const acc of targetAccounts) {
      const accPrefix = `[操作账号: ${formatAccountLabel(acc.id, acc.nickname)}]`;
      try {
        const streakRes = await workbuddyRealApi.getDailyStreak(
          acc.credentials,
          acc.authType,
          acc.extraHeaders
        );
        await new Promise((r) => setTimeout(r, 300));
        const livePts = await handleFetchLivePoints(acc, false);
        const displayPts = roundPoints(livePts ?? acc.points);
        if (streakRes.ok) {
          const days = streakRes.data?.data?.streak?.days || streakRes.data?.streak?.days || 1;
          addLog(
            'success',
            acc.id,
            `${accPrefix} 每日活跃打卡完成 (连续活跃 ${days} 天，今日已达标 · 官方实时积分: ${displayPts})`
          );
        } else if (streakRes.status === 401) {
          addLog('error', acc.id, `${accPrefix} 签到失败：Cookie 失效，请双击账号更新`);
        } else {
          addLog('info', acc.id, `${accPrefix} 每日签到接口调用完成 (状态码: ${streakRes.status} · 实时积分: ${displayPts})`);
        }
      } catch {
        addLog('warn', acc.id, `${accPrefix} 签到请求未完成`);
      }
    }

    setIsRunning(false);
    setRunningStatusText('签到完成');
  };

  // Complete & Claim Tasks (prioritize claiming already-completed tasks first, then run remaining pending tasks)
  const handleClaimCompletedTasks = async () => {
    if (isRunning) return;
    if (!ensureLicenseAuthorized('完成任务并领奖')) return;
    const targetAccounts = getTargetAccountsWithPermissionCheck('完成任务并领奖');
    if (targetAccounts.length === 0) return;

    setIsRunning(true);
    setRunningStatusText('正在领取已完成奖励并执行任务...');

    for (const acc of targetAccounts) {
      const accPrefix = `[操作账号: ${formatAccountLabel(acc.id, acc.nickname)}]`;
      if (!acc.credentials) {
        addLog('warn', acc.id, `${accPrefix} 未配置凭据，已跳过`);
        continue;
      }

      let runningPoints = roundPoints(acc.points);
      const initPts = await handleFetchLivePoints(acc, false);
      if (initPts !== null) runningPoints = initPts;

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
        const ptsBefore = runningPoints;
        addLog('info', acc.id, `${accPrefix} 开始处理任务「${t.name}」...`);
        const execRes = await workbuddyRealApi.executeGrowthTask(
          t,
          acc.credentials,
          acc.authType,
          acc.extraHeaders,
          (level, msg) => addLog(level, acc.id, `${accPrefix} [${t.name}] ${msg}`)
        );
        // Wait briefly so billing ledger reflects claimed reward, then update points
        await new Promise((r) => setTimeout(r, 450));
        const livePts = await handleFetchLivePoints(acc, false);
        if (livePts !== null) runningPoints = livePts;

        if (execRes.claimed || (livePts !== null && livePts > ptsBefore)) {
          addLog(
            'success',
            acc.id,
            `${accPrefix} 成功完成并领取「${t.name}」奖励 (+${t.reward}分)，实时总积分：${runningPoints}`
          );
        } else {
          addLog('warn', acc.id, `${accPrefix} 「${t.name}」未领奖：${execRes.detail}（当前实时积分：${runningPoints}）`);
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
    if (!ensureLicenseAuthorized('一键猫猫旅行')) return;
    const targetAccounts = getTargetAccountsWithPermissionCheck('一键猫猫旅行');
    if (targetAccounts.length === 0) return;

    setIsRunning(true);
    setRunningStatusText('正在执行猫猫旅行...');
    try {
      const updated = await automationEngine.runCatTravelOnly(
        targetAccounts,
        (logItem, currentProgressAccounts) => {
          setLogs((prev) => [logItem, ...prev.slice(0, 300)]);
          setAccounts((prev) =>
            prev.map((acc) => {
              const found = currentProgressAccounts.find((p) => p.id === acc.id);
              return found ? { ...found, points: roundPoints(found.points) } : acc;
            })
          );
        }
      );
      setAccounts((prev) =>
        prev.map((acc) => {
          const found = updated.find((u) => u.id === acc.id);
          return found ? { ...found, points: roundPoints(found.points) } : acc;
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
    addLog('warn', currentAccount?.id || 'system', '[系统] 用户取消了当前的批量执行操作');
  };

  // Filter tasks in table
  const displayedTasks = (currentAccount?.tasks || []).filter((task) => {
    if (taskFilter === '未完成') return task.status !== '已领奖';
    if (taskFilter === '已领奖') return task.status === '已领奖';
    return true;
  });

  // Account-isolated log view filtering
  const displayedLogs =
    logViewScope === 'current' && currentAccount
      ? logs.filter((l) => l.accountId === currentAccount.id)
      : logs;

  const handleCopyLogs = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (displayedLogs.length === 0) return;
    const scopeTitle =
      logViewScope === 'current' && currentAccount
        ? `账号 ${formatAccountLabel(currentAccount.id, currentAccount.nickname)} 日志 (${displayedLogs.length} 条)`
        : `全部账号汇总日志 (${displayedLogs.length} 条)`;
    const content = [
      `=== WorkBuddy 自动化工具 · ${scopeTitle} ===`,
      ...displayedLogs
        .slice()
        .reverse()
        .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`),
    ].join('\n');

    try {
      await navigator.clipboard.writeText(content);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = content;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const copyDetailText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedDetail(true);
    setTimeout(() => setCopiedDetail(false), 2000);
  };

  return (
    <div
      className={`h-full w-full bg-slate-900 flex flex-col font-sans select-none overflow-hidden ${
        isElectronApp && !isWindowMaximized ? 'border border-slate-800/90' : ''
      }`}
    >
      {/* 1. Window Title Bar & Header (Fixed Top, Frameless Drag Region in Desktop Mode) */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-slate-950/95 border-b border-slate-800 app-drag-region">
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
              onClick={handleOpenVersionModal}
              title="点击自动检测版本更新并查看版本管理"
              className="app-no-drag relative inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-[11px] font-mono text-slate-300 transition-colors cursor-pointer"
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
        <div className="flex items-center gap-2 app-no-drag">
          <button
            type="button"
            onClick={() => setIsLicenseModalOpen(true)}
            title={licenseState.message}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg border flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              licenseState.status === 'valid'
                ? 'bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 border-emerald-500/35'
                : licenseState.status === 'grace_offline'
                ? 'bg-amber-950/50 hover:bg-amber-900/60 text-amber-300 border-amber-500/40'
                : licenseState.status === 'expired' || licenseState.status === 'invalid'
                ? 'bg-rose-950/60 hover:bg-rose-900/70 text-rose-300 border-rose-500/50 animate-pulse'
                : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30'
            }`}
          >
            {licenseState.status === 'valid' ? (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            ) : licenseState.status === 'grace_offline' ? (
              <WifiOff className="w-3.5 h-3.5 text-amber-400" />
            ) : licenseState.status === 'expired' || licenseState.status === 'invalid' ? (
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            ) : (
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span>
              {licenseState.status === 'valid'
                ? `已授权 · 剩余 ${licenseState.remainingDays ?? '--'} 天`
                : licenseState.status === 'grace_offline'
                ? `宽限运行 · 剩余 ${licenseState.remainingDays ?? '--'} 天`
                : licenseState.status === 'checking'
                ? 'License 校验中...'
                : licenseState.status === 'expired'
                ? '授权已过期 · 点击处理'
                : licenseState.status === 'invalid'
                ? '授权失效 · 点击处理'
                : '未授权 · 点击激活'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleOpenVersionModal}
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
            onClick={() => {
              if (!ensureLicenseAuthorized('添加账号')) return;
              setIsAddAccountOpen(true);
            }}
            disabled={!licenseState.isAuthorized}
            title={!licenseState.isAuthorized ? '请先完成 License 授权校验' : undefined}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
          >
            {!licenseState.isAuthorized ? (
              <Lock className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>+ 添加账号</span>
          </button>

          <button
            type="button"
            onClick={handleRefreshAll}
            disabled={!licenseState.isAuthorized}
            title={!licenseState.isAuthorized ? '请先完成 License 授权校验' : undefined}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
          >
            {!licenseState.isAuthorized ? (
              <Lock className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
            )}
            <span>刷新全部</span>
          </button>

          {isElectronApp && (
            <div className="flex items-center gap-1 pl-2 ml-1 border-l border-slate-800">
              <button
                type="button"
                onClick={handleWindowMinimize}
                title="最小化"
                className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleWindowToggleMaximize}
                title={isWindowMaximized ? '向下还原' : '最大化'}
                className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                {isWindowMaximized ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={handleWindowClose}
                title="关闭"
                className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-rose-600 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
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

      {/* 2.5 License Validation Prompt / Warning Banner */}
      {(licenseState.status === 'invalid' || licenseState.status === 'expired') && (
        <div className="shrink-0 px-5 py-2 bg-rose-950/60 border-b border-rose-500/40 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-rose-200 min-w-0">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="font-semibold text-rose-300 shrink-0">
              {licenseState.status === 'expired' ? 'License 授权已过期：' : 'License 校验失败：'}
            </span>
            <span className="truncate">{licenseState.message}</span>
            <span className="text-rose-300/80 text-[11px] shrink-0 font-mono">
              （核心执行与领奖按钮已禁用）
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsLicenseModalOpen(true)}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              激活 License
            </button>
          </div>
        </div>
      )}

      {licenseState.status === 'unlicensed' && !licenseBannerDismissed && (
        <div className="shrink-0 px-5 py-2 bg-amber-950/40 border-b border-amber-500/35 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-amber-200 min-w-0">
            <ShieldOff className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-semibold text-amber-300 shrink-0">未配置 License：</span>
            <span className="truncate">
              安装启动可跳过，但执行日常、签到、猫猫旅行、领奖及刷新接口已禁用，激活后立即解锁。
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsLicenseModalOpen(true)}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              立即配置授权
            </button>
            <button
              type="button"
              onClick={() => setLicenseBannerDismissed(true)}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-[11px] transition-colors cursor-pointer whitespace-nowrap"
            >
              暂跳过提醒
            </button>
          </div>
        </div>
      )}

      {licenseState.status === 'grace_offline' && (
        <div className="shrink-0 px-5 py-1.5 bg-amber-950/25 border-b border-amber-500/25 flex items-center justify-between gap-3 text-[11px]">
          <div className="flex items-center gap-2 text-amber-200/90 min-w-0">
            <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">{licenseState.message}</span>
            <span className="font-mono text-emerald-300 shrink-0">
              剩余可用 {licenseState.remainingDays ?? '--'} 天
            </span>
          </div>
          <button
            type="button"
            disabled={isLicenseBusy}
            onClick={() => handleManualVerifyLicense()}
            className="px-2.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-amber-200 rounded border border-amber-500/30 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
          >
            {isLicenseBusy ? '重连中...' : '重试联网校验'}
          </button>
        </div>
      )}

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
                      <span>{roundPoints(currentAccount.points)}</span>
                      <span className="text-xs text-slate-400 font-normal">积分</span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (!ensureLicenseAuthorized('刷新实时积分')) return;
                      handleFetchLivePoints(currentAccount, true);
                    }}
                    disabled={isSyncingPoints || !licenseState.isAuthorized}
                    title={
                      !licenseState.isAuthorized
                        ? '请先激活有效 License 后使用'
                        : '调官方服务获取实时积分'
                    }
                    className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
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
                      disabled={!licenseState.isAuthorized}
                      title={!licenseState.isAuthorized ? '请先完成 License 授权校验' : undefined}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        currentAccount.catTravel.autoTravel
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {!licenseState.isAuthorized && <Lock className="w-3 h-3 text-amber-400" />}
                      <span>{currentAccount.catTravel.autoTravel ? '☑ 自动旅行' : '☐ 自动旅行'}</span>
                    </button>
                    <button
                      onClick={handleRefreshCatTravelStatus}
                      disabled={isRunning || !licenseState.isAuthorized}
                      title={!licenseState.isAuthorized ? '请先完成 License 授权校验' : undefined}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] rounded border border-slate-700 transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {!licenseState.isAuthorized ? (
                        <Lock className="w-3 h-3 text-amber-400" />
                      ) : (
                        <RefreshCw className="w-3 h-3 text-slate-400" />
                      )}
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
                              disabled={
                                isRowExecuting ||
                                (!licenseState.isAuthorized &&
                                  task.status !== '已领奖' &&
                                  !(isWeChatTask && task.status !== '待领奖'))
                              }
                              title={
                                !licenseState.isAuthorized &&
                                task.status !== '已领奖' &&
                                !(isWeChatTask && task.status !== '待领奖')
                                  ? '请先激活有效 License 后执行'
                                  : undefined
                              }
                              onClick={async (e) => {
                                e.stopPropagation();
                                setSelectedTaskId(task.id);
                                if ((isWeChatTask && task.status !== '待领奖') || task.status === '已领奖') {
                                  setAssistingTask(task);
                                  return;
                                }
                                if (!ensureLicenseAuthorized(`单条执行「${task.name}」`)) return;
                                setExecutingTaskId(task.id);
                                try {
                                  await handleExecuteAndClaimSingleTask(task);
                                } finally {
                                  setExecutingTaskId(null);
                                }
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed ${
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
                              ) : isWeChatTask && task.status !== '待领奖' ? (
                                <>
                                  <QrCode className="w-2.5 h-2.5" />
                                  <span>扫码关注</span>
                                </>
                              ) : !licenseState.isAuthorized ? (
                                <>
                                  <Lock className="w-2.5 h-2.5 text-amber-400" />
                                  <span>{task.status === '待领奖' ? '领奖锁定' : '未授权'}</span>
                                </>
                              ) : task.status === '待领奖' ? (
                                <>
                                  <Gift className="w-2.5 h-2.5" />
                                  <span>立即领奖</span>
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
                <span>仅已选账号 ({selectedAccountIds.length})</span>
              </label>
              <span className="text-[11px] text-slate-400 font-mono ml-1 whitespace-nowrap truncate max-w-[160px]" title={runningStatusText}>
                {runningStatusText}
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
              {!licenseState.isAuthorized && (
                <button
                  type="button"
                  onClick={() => setIsLicenseModalOpen(true)}
                  className="px-2.5 py-1.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-xs font-medium rounded-lg border border-rose-500/35 flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Lock className="w-3 h-3" />
                  <span>需激活 License</span>
                </button>
              )}

              <button
                onClick={handleExecuteAllDaily}
                disabled={isRunning || !licenseState.isAuthorized}
                title={!licenseState.isAuthorized ? '请先完成 License 授权校验后使用' : undefined}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap shrink-0"
              >
                {!licenseState.isAuthorized ? (
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                ) : isRunning ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                )}
                <span>一键执行全部日常</span>
              </button>

              <button
                onClick={handleExecuteStreak}
                disabled={isRunning || !licenseState.isAuthorized}
                title={!licenseState.isAuthorized ? '请先完成 License 授权校验后使用' : undefined}
                className="px-2.5 py-1.5 bg-emerald-700/80 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg shadow-sm flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap shrink-0"
              >
                {!licenseState.isAuthorized ? (
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <CalendarCheck className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>签到 / 每日活跃</span>
              </button>

              <button
                onClick={handleExecuteCatTravel}
                disabled={isRunning || !licenseState.isAuthorized}
                title={!licenseState.isAuthorized ? '请先完成 License 授权校验后使用' : undefined}
                className="px-2.5 py-1.5 bg-emerald-700/80 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg shadow-sm flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap shrink-0"
              >
                {!licenseState.isAuthorized ? (
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <Compass className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>一键猫猫旅行</span>
              </button>

              <button
                onClick={handleClaimCompletedTasks}
                disabled={isRunning || !licenseState.isAuthorized}
                title={!licenseState.isAuthorized ? '请先完成 License 授权校验后使用' : undefined}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg border border-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                {!licenseState.isAuthorized ? (
                  <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                ) : (
                  <Gift className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                )}
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
          <div className="truncate flex items-center gap-2 min-w-0">
            <span className="text-emerald-400 font-semibold shrink-0">
              日志控制台 ({displayedLogs.length}/{logs.length})
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-200 truncate">{displayedLogs[0]?.message || '当前账号暂无运行日志...'}</span>
          </div>
          <div className="flex items-center gap-2.5 shrink-0 ml-2">
            {/* Account isolation toggle */}
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5 text-[10px]"
            >
              <button
                type="button"
                onClick={() => setLogViewScope('current')}
                className={`px-1.5 py-0.2 rounded transition-colors cursor-pointer ${
                  logViewScope === 'current'
                    ? 'bg-emerald-600/30 text-emerald-300 font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                仅当前账号
              </button>
              <button
                type="button"
                onClick={() => setLogViewScope('all')}
                className={`px-1.5 py-0.2 rounded transition-colors cursor-pointer ${
                  logViewScope === 'all'
                    ? 'bg-slate-700 text-slate-100 font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                全部日志
              </button>
            </div>

            {/* One-click Copy Logs */}
            <button
              type="button"
              onClick={handleCopyLogs}
              disabled={displayedLogs.length === 0}
              title="一键复制当前视图下的全部日志"
              className={`px-2 py-0.5 rounded border text-[10px] flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40 ${
                copiedLogs
                  ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              {copiedLogs ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedLogs ? '已复制' : '复制日志'}</span>
            </button>

            {isLogOpen && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (logViewScope === 'current' && currentAccount) {
                    setLogs((prev) => prev.filter((l) => l.accountId !== currentAccount.id));
                  } else {
                    setLogs([]);
                  }
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
          <div className="flex-1 min-h-0 px-4 py-1.5 overflow-y-auto font-mono text-[11px] space-y-1 select-text">
            {displayedLogs.map((log) => (
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
            {displayedLogs.length === 0 && (
              <div className="py-4 text-center text-slate-500">
                当前账号暂无运行日志（已启用账号日志隔离）
              </div>
            )}
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
        hasChecked={hasCheckedVersion}
        checkError={checkVersionError}
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
        isAuthorized={licenseState.isAuthorized}
        licenseMessage={licenseState.message}
        onOpenLicenseModal={() => setIsLicenseModalOpen(true)}
      />

      {/* License Authorization Modal */}
      <LicenseModal
        isOpen={isLicenseModalOpen}
        onClose={() => setIsLicenseModalOpen(false)}
        licenseState={licenseState}
        isBusy={isLicenseBusy}
        onActivateOnline={handleActivateLicenseOnline}
        onVerifyOfflineFile={handleVerifyOfflineLic}
        onManualVerify={handleManualVerifyLicense}
        onClearLicense={handleClearLicense}
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
