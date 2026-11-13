export type AccountRegion = '国内版' | '国际版';
export type AccountStatus = '正常' | '异常' | '运行中' | '排队中';

export type TaskStatus = '已领奖' | '需等待' | '需人工' | '进行中' | '未完成';

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
