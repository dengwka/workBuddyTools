export type AccountRegion = '国内版' | '国际版';
export type AccountStatus = '正常' | '异常' | '运行中' | '排队中';

export type TaskStatus = '已领奖' | '待领奖' | '需等待' | '需人工' | '进行中' | '未完成';

export interface WorkBuddyTask {
  id: string;
  name: string;
  status: TaskStatus;
  currentProgress: number;
  targetProgress: number;
  reward: number; // 奖励积分
  recentResult: string;
  reason: string;
  autoExecutable: boolean;
  jumpUrl?: string;
}

export interface CatTravelInfo {
  status: '今日已完成' | '旅行中' | '待出发';
  statusUpdated: string;
  detailMessage: string;
  lastResult: string;
  autoTravel: boolean;
  destination?: string;
  remainingSeconds?: number;
}

export interface WorkBuddyAccount {
  id: string;
  nickname: string;
  region: AccountRegion;
  status: AccountStatus;
  points: number;
  authType: 'cookie' | 'token';
  credentials: string; // Cookie string, token, or cURL
  extraHeaders?: Record<string, string>;
  proxyUrl?: string;
  lastUpdated: string;
  catTravel: CatTravelInfo;
  tasks: WorkBuddyTask[];
}

export interface SystemExecutionStats {
  total: number;
  queued: number;
  running: number;
  roundSuccess: number;
  roundFailed: number;
  skipped: number;
  lastRefreshed: string;
}

export interface ExecutionLog {
  id: string;
  timestamp: string;
  accountId: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

export type LicenseStatus =
  | 'unlicensed'     // 未配置授权（安装/启动可跳过，但业务功能锁定）
  | 'checking'       // 正在联网校验
  | 'valid'          // 在线校验通过
  | 'grace_offline'  // 弱网容错宽限态（此前已授权且未过期，网络波动不中断业务）
  | 'invalid'        // 服务端明确拒绝（不存在/禁用/MAC冲突/编码不匹配）
  | 'expired';       // 授权已过期（本地时间或服务端判定到期）

export interface LicenseRecord {
  licenseKey: string;
  appType: string;
  appName?: string;
  macAddress: string;
  expireTime: string;
  remainingDays?: number;
  activatedAt?: string;
  lastVerifiedAt?: string;
  proxyUrl?: string;
  mode?: 'online' | 'offline';
}

export interface LicenseValidationState {
  status: LicenseStatus;
  isAuthorized: boolean; // valid 或有效的 grace_offline 返回 true
  message: string;
  code?: string;
  remainingDays: number | null;
  expireTime: string;
  appType: string;
  appName: string;
  macAddress: string;
  allMacs: string[];
  licenseKey: string;
  lastVerifiedAt?: string;
  lastAttemptAt?: string;
  channelUsed?: string;
  isOfflineGrace: boolean;
}

