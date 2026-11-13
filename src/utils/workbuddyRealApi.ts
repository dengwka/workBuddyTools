import { WorkBuddyTask } from '../types/workbuddy';

export interface WorkBuddyRawTask {
  task_code: string;
  task_type: string;
  title: string;
  description?: string;
  task_desc?: string;
  accept_status: 'not_accepted' | 'accepted' | 'in_progress' | 'completed' | 'claimed';
  reward_credit: number;
  reward_energy?: number;
  current_progress?: number;
  target_progress?: number;
  jump_url?: string;
}

export interface WorkBuddyUserResourceSummary {
  total_credit?: number;
  platform_reward_credit?: number;
  subscription_credit?: number;
  balance?: number;
  raw?: any;
}

export interface ExtractedCredentialInfo {
  credentials: string;
  authType: 'cookie' | 'token';
  isExtractedFromCurl?: boolean;
  extraHeaders?: Record<string, string>;
  curlMethod?: 'GET' | 'POST';
  curlBody?: any;
  autoCompletedRealm?: boolean;
}

const EXTRA_HEADERS_STORAGE_KEY = 'workbuddy_curl_extra_headers_v1';
const memoryHeadersCache: Record<string, Record<string, string>> = {};
const accountIdentityCache: Record<
  string,
  { uid: string; nickname: string; machineId: string; enterpriseId?: string; enterpriseUserName?: string }
> = {};

function hashFullString(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + (i & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}_${input.length}`;
}

function getCredentialCacheKey(cred: string): string {
  const trimmed = (cred || '').trim();
  const sessMatch = trimmed.match(/(?:^|;\s*)session=([^;\s]+)/);
  if (sessMatch && sessMatch[1]) {
    return `sess_${hashFullString(sessMatch[1])}`;
  }
  return `cred_${hashFullString(trimmed)}`;
}

function getStableMachineId(cred: string): string {
  const key = getCredentialCacheKey(cred);
  const hex = key.replace(/[^a-f0-9]/gi, '').padEnd(16, '0').slice(0, 16);
  return `${hex.slice(0, 8)}-7b9c-4d2e-9a1f-${hex.slice(0, 12)}`;
}

export function roundPoints(val: unknown): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

export function formatAccountLabel(accountId: string, nickname?: string): string {
  const cleanId = String(accountId || '').trim();
  const shortId = cleanId.length > 12 ? cleanId.slice(0, 8) : cleanId;
  const cleanNick = String(nickname || '').trim();
  if (cleanNick && cleanNick !== cleanId) {
    return shortId ? `${cleanNick} (${shortId})` : cleanNick;
  }
  return shortId || cleanId || '未知账号';
}

export function extractIdFromJumpUrl(jumpUrl?: string, keys: string[] = ['expert_id', 'expertId', 'id', 'agent_id']): string {
  if (!jumpUrl || typeof jumpUrl !== 'string') return '';
  try {
    const url = new URL(jumpUrl, 'https://www.workbuddy.cn');
    for (const k of keys) {
      const val = url.searchParams.get(k);
      if (val && val.trim()) return val.trim();
    }
  } catch {
    // try regex fallback
  }
  for (const k of keys) {
    const m = jumpUrl.match(new RegExp(`[?&]${k}=([^&#]+)`));
    if (m?.[1]) return decodeURIComponent(m[1]).trim();
  }
  return '';
}

function generateRequestId(): string {
  let out = '';
  for (let i = 0; i < 32; i++) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}

export function saveExtraHeadersForCredential(cred: string, headers?: Record<string, string>) {
  if (!cred || !headers || Object.keys(headers).length === 0) return;
  const key = getCredentialCacheKey(cred);
  memoryHeadersCache[key] = { ...(memoryHeadersCache[key] || {}), ...headers };
  try {
    const raw = localStorage.getItem(EXTRA_HEADERS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[key] = memoryHeadersCache[key];
    localStorage.setItem(EXTRA_HEADERS_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // ignore storage errors
  }
}

export function getExtraHeadersForCredential(cred: string): Record<string, string> {
  if (!cred) return {};
  const key = getCredentialCacheKey(cred);
  if (memoryHeadersCache[key]) {
    return memoryHeadersCache[key];
  }
  try {
    const raw = localStorage.getItem(EXTRA_HEADERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed[key]) {
        memoryHeadersCache[key] = parsed[key];
        return parsed[key];
      }
    }
  } catch {
    // ignore
  }
  return {};
}

/**
 * Ensures Domestic (国内版) WorkBuddy cookies always include
 * `cb_login_mode=v2; cb_login_realm=copilot` when `session=` is present,
 * matching PostAPI / browser Cookie Jar behavior.
 */
export function normalizeWorkBuddyCookie(rawCookie: string): {
  cookie: string;
  autoCompletedRealm: boolean;
} {
  let cookie = (rawCookie || '')
    .replace(/\\\r?\n/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .trim();

  let autoCompletedRealm = false;

  if (cookie.includes('session=')) {
    const hasLoginMode = /(?:^|;\s*)cb_login_mode=/i.test(cookie);
    const hasLoginRealm = /(?:^|;\s*)cb_login_realm=/i.test(cookie);

    const prefixParts: string[] = [];
    if (!hasLoginMode) {
      prefixParts.push('cb_login_mode=v2');
      autoCompletedRealm = true;
    }
    if (!hasLoginRealm) {
      prefixParts.push('cb_login_realm=copilot');
      autoCompletedRealm = true;
    }

    if (prefixParts.length > 0) {
      cookie = `${prefixParts.join('; ')}; ${cookie}`;
    }
  }

  return { cookie, autoCompletedRealm };
}

export function extractCleanCredentials(
  rawInput: string,
  currentAuthType: 'cookie' | 'token' = 'cookie'
): ExtractedCredentialInfo {
  let cleaned = (rawInput || '').trim();
  if (!cleaned) {
    return { credentials: '', authType: currentAuthType };
  }

  // 1. Detect cURL command from Chrome DevTools, Edge, or PostAPI
  if (
    cleaned.startsWith('curl') ||
    cleaned.includes(' --url ') ||
    cleaned.includes(' -b ') ||
    cleaned.includes('\n-b ') ||
    cleaned.includes('--cookie') ||
    /-[Hh]\s+['"]/i.test(cleaned)
  ) {
    const extraHeaders: Record<string, string> = {};
    let cookieFromCurl = '';
    let tokenFromCurl = '';

    const headerRegex = /(?:-H|--header)\s+(?:'([^']*)'|"([^"]*)")/gi;
    let hMatch: RegExpExecArray | null;
    while ((hMatch = headerRegex.exec(cleaned)) !== null) {
      const rawHeader = (hMatch[1] ?? hMatch[2] ?? '').trim();
      const colonIdx = rawHeader.indexOf(':');
      if (colonIdx > 0) {
        const hName = rawHeader.slice(0, colonIdx).trim();
        const hVal = rawHeader.slice(colonIdx + 1).trim();
        const lowerName = hName.toLowerCase();

        if (lowerName === 'cookie') {
          cookieFromCurl = cookieFromCurl ? `${cookieFromCurl}; ${hVal}` : hVal;
        } else if (
          lowerName !== 'host' &&
          lowerName !== 'content-length' &&
          lowerName !== 'connection' &&
          lowerName !== 'accept-encoding'
        ) {
          extraHeaders[hName] = hVal;
          if (lowerName === 'authorization') {
            tokenFromCurl = hVal.replace(/^Bearer\s+/i, '').trim();
          }
        }
      }
    }

    const bRegex = /(?:-b|--cookie)\s+(?:'([^']*)'|"([^"]*)"|(\S+))/gi;
    let bMatch: RegExpExecArray | null;
    while ((bMatch = bRegex.exec(cleaned)) !== null) {
      const bVal = (bMatch[1] ?? bMatch[2] ?? bMatch[3] ?? '').trim();
      if (bVal) {
        cookieFromCurl = cookieFromCurl ? `${cookieFromCurl}; ${bVal}` : bVal;
      }
    }

    let curlMethod: 'GET' | 'POST' | undefined;
    const methodMatch = cleaned.match(/(?:-X|--request)\s+['"]?(GET|POST|PUT|DELETE)['"]?/i);
    if (methodMatch && methodMatch[1]) {
      curlMethod = methodMatch[1].toUpperCase() as 'GET' | 'POST';
    }

    let curlBody: any = undefined;
    const dataMatch = cleaned.match(/(?:--data-raw|--data-binary|--data|-d)\s+(?:'([^']*)'|"([^"]*)")/i);
    if (dataMatch) {
      const rawData = dataMatch[1] ?? dataMatch[2] ?? '';
      if (!curlMethod) curlMethod = 'POST';
      try {
        curlBody = rawData ? JSON.parse(rawData) : {};
      } catch {
        curlBody = rawData;
      }
    }

    if (cookieFromCurl) {
      const { cookie, autoCompletedRealm } = normalizeWorkBuddyCookie(cookieFromCurl);
      saveExtraHeadersForCredential(cookie, extraHeaders);
      return {
        credentials: cookie,
        authType: 'cookie',
        isExtractedFromCurl: true,
        extraHeaders,
        curlMethod,
        curlBody,
        autoCompletedRealm,
      };
    }

    if (tokenFromCurl) {
      saveExtraHeadersForCredential(tokenFromCurl, extraHeaders);
      return {
        credentials: tokenFromCurl,
        authType: 'token',
        isExtractedFromCurl: true,
        extraHeaders,
        curlMethod,
        curlBody,
      };
    }
  }

  // 2. Strip leading "Cookie: " or "cookie: "
  if (/^cookie:\s*/i.test(cleaned)) {
    cleaned = cleaned.replace(/^cookie:\s*/i, '').trim();
    const { cookie, autoCompletedRealm } = normalizeWorkBuddyCookie(cleaned);
    return {
      credentials: cookie,
      authType: 'cookie',
      extraHeaders: getExtraHeadersForCredential(cookie),
      autoCompletedRealm,
    };
  }

  // 3. Strip leading "Authorization: Bearer " or "Bearer "
  if (/^(?:authorization:\s*)?bearer\s+/i.test(cleaned)) {
    cleaned = cleaned.replace(/^(?:authorization:\s*)?bearer\s+/i, '').trim();
    return {
      credentials: cleaned,
      authType: 'token',
      extraHeaders: getExtraHeadersForCredential(cleaned),
    };
  }

  // 4. Strip wrapping single or double quotes
  if (
    (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
    (cleaned.startsWith('"') && cleaned.endsWith('"'))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // 5. If it looks like a cookie
  if ((cleaned.includes(';') && cleaned.includes('=')) || cleaned.includes('session=')) {
    const { cookie, autoCompletedRealm } = normalizeWorkBuddyCookie(cleaned);
    return {
      credentials: cookie,
      authType: 'cookie',
      extraHeaders: getExtraHeadersForCredential(cookie),
      autoCompletedRealm,
    };
  }

  // 6. If it looks like a JWT token
  if (cleaned.startsWith('ey') && !cleaned.includes(';')) {
    return {
      credentials: cleaned,
      authType: 'token',
      extraHeaders: getExtraHeadersForCredential(cleaned),
    };
  }

  return {
    credentials: cleaned,
    authType: currentAuthType,
    extraHeaders: getExtraHeadersForCredential(cleaned),
  };
}

export class WorkBuddyRealApi {
  private baseUrl = 'https://www.workbuddy.cn';

  private getHeaders(
    credentials: string,
    authType: 'cookie' | 'token',
    explicitExtraHeaders?: Record<string, string>,
    skipRealmAutoComplete = false,
    targetUrl = ''
  ): Record<string, string> {
    const isExternalPublicUrl =
      targetUrl.startsWith('http') &&
      !targetUrl.startsWith('https://www.workbuddy.cn') &&
      !targetUrl.includes('.workbuddy.cn');

    if (isExternalPublicUrl) {
      return {
        Accept: 'application/json, text/plain, */*',
        ...(explicitExtraHeaders || {}),
      };
    }

    const cleanInfo = extractCleanCredentials(credentials, authType);
    let clean = cleanInfo.credentials;
    if (skipRealmAutoComplete && clean.startsWith('cb_login_mode=v2; cb_login_realm=copilot; ')) {
      clean = clean.replace(/^cb_login_mode=v2;\s*cb_login_realm=copilot;\s*/, '');
    }

    const finalAuthType = cleanInfo.authType;
    const cachedHeaders = getExtraHeadersForCredential(clean);
    const mergedExtra = {
      ...cachedHeaders,
      ...(cleanInfo.extraHeaders || {}),
      ...(explicitExtraHeaders || {}),
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,zh-TW;q=0.8,en;q=0.7',
      'Cache-Control': 'no-cache',
      'X-Client-Platform': 'web',
      'X-Submitted-From': 'web',
      'X-Request-ID': generateRequestId(),
      Origin: 'https://www.workbuddy.cn',
      Referer:
        targetUrl.includes('/portal/') || targetUrl.includes('/console/') || targetUrl.includes('/v2/user-asset/')
          ? 'https://www.workbuddy.cn/app'
          : 'https://www.workbuddy.cn/profile/growth-center',
      ...mergedExtra,
    };

    if (finalAuthType === 'cookie') {
      // Never send desktop platform/UA headers with Web Cookie auth (APISIX returns 401 when X-Client-Platform=desktop lacks desktop Bearer JWT)
      for (const k of Object.keys(headers)) {
        const lower = k.toLowerCase();
        if (lower === 'x-client-platform') headers[k] = 'web';
        if (lower === 'x-submitted-from') headers[k] = 'web';
        if (lower === 'x-client-version' || lower === 'x-app-version') delete headers[k];
        if (lower === 'user-agent' && String(headers[k]).includes('WorkBuddy/')) delete headers[k];
      }
    }

    if (finalAuthType === 'token') {
      const token = clean.replace(/^Bearer\s+/i, '');
      headers['Authorization'] = `Bearer ${token}`;
      if (!headers['Cookie']) {
        headers['Cookie'] = `token=${token}; wb_token=${token}`;
      }
    } else {
      headers['Cookie'] = clean;
    }

    return headers;
  }

  // Sends request through Electron IPC proxy (Desktop) or Express backend proxy (Web)
  private async request(
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    credentials: string,
    authType: 'cookie' | 'token',
    body?: any,
    extraHeaders?: Record<string, string>,
    skipRealmAutoComplete = false
  ): Promise<{ ok: boolean; status: number; data: any }> {
    const targetUrl = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const headers = this.getHeaders(credentials, authType, extraHeaders, skipRealmAutoComplete, targetUrl);

    try {
      const electronAPI = (window as unknown as {
        electronAPI?: {
          isElectron?: boolean;
          proxyRequest?: (payload: {
            url: string;
            method: string;
            headers: Record<string, string>;
            body?: any;
          }) => Promise<{ ok: boolean; status: number; data: any }>;
        };
      }).electronAPI;

      if (electronAPI?.isElectron && typeof electronAPI.proxyRequest === 'function') {
        return await electronAPI.proxyRequest({
          url: targetUrl,
          method,
          headers,
          body,
        });
      }

      const proxyRes = await fetch('/api/workbuddy/proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: targetUrl,
          method,
          headers,
          body,
        }),
      });

      const responseData = await proxyRes.json().catch(() => ({}));
      return {
        ok: proxyRes.ok && proxyRes.status < 400,
        status: proxyRes.status,
        data: responseData,
      };
    } catch (err: unknown) {
      console.error(`Request to ${path} failed:`, err);
      return {
        ok: false,
        status: 500,
        data: { error: err instanceof Error ? err.message : 'Network error' },
      };
    }
  }

  // 1. Fetch current user info & console account identity
  public async getUserInfo(
    credentials: string,
    authType: 'cookie' | 'token',
    extraHeaders?: Record<string, string>
  ) {
    const res1 = await this.request('/console/accounts', 'GET', credentials, authType, undefined, extraHeaders);
    if (res1.ok && res1.data?.data?.accounts?.[0]) {
      const acc = res1.data.data.accounts[0];
      const key = getCredentialCacheKey(credentials);
      accountIdentityCache[key] = {
        uid: String(acc.uid || acc.uin || ''),
        nickname: String(acc.nickname || acc.enterpriseUserName || acc.uid || ''),
        machineId: getStableMachineId(credentials),
      };
      return {
        ok: true,
        status: res1.status,
        data: { data: acc },
      };
    }
    return this.request('/users/self', 'GET', credentials, authType, undefined, extraHeaders);
  }

  private async resolveAccountIdentity(
    credentials: string,
    authType: 'cookie' | 'token',
    extraHeaders?: Record<string, string>
  ): Promise<{ uid: string; nickname: string; machineId: string; enterpriseId?: string; enterpriseUserName?: string }> {
    const key = getCredentialCacheKey(credentials);
    if (accountIdentityCache[key]?.uid) {
      return accountIdentityCache[key];
    }

    const extractUidFromCreds = (): string => {
      const uinMatch = credentials.match(/(?:^|;\s*)(?:p_uin|uin|uid|user_id|o_uid)=o?0*([0-9a-zA-Z_-]{4,32})/i);
      if (uinMatch?.[1]) return uinMatch[1];
      return '';
    };

    const res = await this.request('/console/accounts', 'GET', credentials, authType, undefined, extraHeaders).catch(
      () => null
    );
    const acc = res?.data?.data?.accounts?.[0] || res?.data?.accounts?.[0];
    const accUid = String(acc?.uid || acc?.uin || acc?.userId || acc?.user_id || acc?.id || '');
    if (accUid) {
      accountIdentityCache[key] = {
        uid: accUid,
        nickname: String(acc?.nickname || acc?.enterpriseUserName || acc?.name || accUid),
        machineId: getStableMachineId(credentials),
        enterpriseId: acc?.enterpriseId ? String(acc.enterpriseId) : undefined,
        enterpriseUserName: acc?.enterpriseUserName ? String(acc.enterpriseUserName) : undefined,
      };
      return accountIdentityCache[key];
    }

    const selfRes = await this.request('/users/self', 'GET', credentials, authType, undefined, extraHeaders).catch(
      () => null
    );
    const selfData = selfRes?.data?.data || selfRes?.data;
    const uid = String(
      selfData?.uid || selfData?.uin || selfData?.userId || selfData?.user_id || selfData?.id || extractUidFromCreds()
    );
    const nickname = String(selfData?.nickname || selfData?.username || selfData?.name || uid || 'WorkBuddyUser');
    accountIdentityCache[key] = {
      uid,
      nickname,
      machineId: getStableMachineId(credentials),
      enterpriseId: selfData?.enterpriseId ? String(selfData.enterpriseId) : undefined,
      enterpriseUserName: selfData?.enterpriseUserName ? String(selfData.enterpriseUserName) : undefined,
    };
    return accountIdentityCache[key];
  }

  /**
   * Sends real WorkBuddy CloudProductMetricsReporter telemetry events to POST /v2/report
   * Matches exact payload structure in static.workbuddy.cn/web/agents/.../main-D4DaPwsz.js
   */
  public async reportTelemetryEvents(
    events: Array<{ eventCode: string; payload?: Record<string, any> }>,
    credentials: string,
    authType: 'cookie' | 'token',
    extraHeaders?: Record<string, string>
  ) {
    const identity = await this.resolveAccountIdentity(credentials, authType, extraHeaders);
    const now = Date.now();
    const desktopUA =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) WorkBuddy/5.9.0 Chrome/131.0.0.0 Electron/33.2.0 Safari/537.36';

    const reportItems = events.map((ev, idx) => ({
      eventCode: ev.eventCode,
      timestamp: now + idx * 12,
      reportDelay: 0,
      userId: identity.uid,
      userNickname: identity.nickname,
      ...(identity.enterpriseId ? { enterpriseId: identity.enterpriseId } : {}),
      ...(identity.enterpriseUserName ? { username: identity.enterpriseUserName } : {}),
      userAgent: desktopUA,
      os: 'Win32',
      timezone: 'Asia/Shanghai',
      mode: 'CLOUD',
      ideName: 'WorkBuddy',
      ideType: 'desktop',
      clientVersion: '5.9.0',
      appVersion: '5.9.0',
      machineId: identity.machineId,
      ...(ev.payload || {}),
    }));

    const webReportHeaders: Record<string, string> = {
      ...(extraHeaders || {}),
      'X-Client-Platform': 'web',
      'X-Submitted-From': 'web',
      Referer: 'https://www.workbuddy.cn/app',
      ...(identity.uid ? { 'X-User-Id': identity.uid } : {}),
    };

    return this.request('/v2/report', 'POST', credentials, authType, reportItems, webReportHeaders);
  }

  // 2. Fetch real resource / credit / points summary with automatic POST / GET & cookie fallback
  public async getResourceSummary(
    credentials: string,
    authType: 'cookie' | 'token',
    extraHeaders?: Record<string, string>
  ) {
    const parsed = extractCleanCredentials(credentials, authType);
    const mergedHeaders = { ...(parsed.extraHeaders || {}), ...(extraHeaders || {}) };

    const primaryMethod = parsed.curlMethod || 'POST';
    const primaryBody = primaryMethod === 'GET' ? undefined : (parsed.curlBody ?? {});

    const res1 = await this.request(
      '/billing/meter/get-user-resource-summary',
      primaryMethod,
      parsed.credentials,
      parsed.authType,
      primaryBody,
      mergedHeaders,
      false
    );
    if (res1.ok) return res1;

    const altMethod = primaryMethod === 'POST' ? 'GET' : 'POST';
    const altBody = altMethod === 'GET' ? undefined : {};
    const res2 = await this.request(
      '/billing/meter/get-user-resource-summary',
      altMethod,
      parsed.credentials,
      parsed.authType,
      altBody,
      mergedHeaders,
      false
    );
    if (res2.ok) return res2;

    if (parsed.autoCompletedRealm) {
      const res3 = await this.request(
        '/billing/meter/get-user-resource-summary',
        'POST',
        parsed.credentials,
        parsed.authType,
        {},
        mergedHeaders,
        true
      );
      if (res3.ok) return res3;

      const res4 = await this.request(
        '/billing/meter/get-user-resource-summary',
        'GET',
        parsed.credentials,
        parsed.authType,
        undefined,
        mergedHeaders,
        true
      );
      if (res4.ok) return res4;
    }

    return res1;
  }

  // 3. Sync WeChat Official Account subscription status & fetch all growth center tasks
  public async getGrowthTasks(
    credentials: string,
    authType: 'cookie' | 'token',
    extraHeaders?: Record<string, string>
  ) {
    // WorkBuddy GrowthI18nProvider always calls subscribe-task/status right before /v2/activity/growth/tasks
    await this.request(
      '/v2/activity/growth/subscribe-task/status',
      'GET',
      credentials,
      authType,
      undefined,
      extraHeaders
    ).catch(() => null);

    return this.request('/v2/activity/growth/tasks', 'GET', credentials, authType, undefined, extraHeaders);
  }

  // 4. Accept task(s)
  public async acceptTasks(
    taskCodes: string[],
    credentials: string,
    authType: 'cookie' | 'token',
    extraHeaders?: Record<string, string>
  ) {
    return this.request(
      '/activity/growth/tasks/accept',
      'POST',
      credentials,
      authType,
      {
        task_codes: taskCodes,
      },
      extraHeaders
    );
  }

  private isApiSuccess(res: { ok: boolean; status: number; data: any }): boolean {
    if (!res.ok) return false;
    const d = res.data;
    if (!d || typeof d !== 'object') return true;
    if (d.code !== undefined && d.code !== 0) return false;
    if (d.ret !== undefined && d.ret !== 0) return false;
    if (d.success === false) return false;
    const msg = String(d.message || d.msg || '').toLowerCase();
    if (msg.includes('not completed') || msg.includes('not finished') || msg.includes('未完成') || msg.includes('fail')) {
      return false;
    }
    return true;
  }

  // 5. Claim reward for a completed task (official GrowthI18nProvider endpoint FIRST: POST /activity/growth/tasks/:code/claim)
  public async claimTaskReward(
    taskCode: string,
    credentials: string,
    authType: 'cookie' | 'token',
    extraHeaders?: Record<string, string>,
    onStepLog?: (level: 'info' | 'warn' | 'error' | 'success', message: string) => void
  ): Promise<{ ok: boolean; status: number; data: any; message: string; endpoint?: string }> {
    const encodedCode = encodeURIComponent(taskCode);
    const growthWebHeaders: Record<string, string> = {
      ...(extraHeaders || {}),
      'X-Client-Platform': 'web',
      'X-Submitted-From': 'web',
      Origin: 'https://www.workbuddy.cn',
      Referer: 'https://www.workbuddy.cn/profile/growth-center',
    };

    const attempts: Array<{ path: string; body: any; headers: Record<string, string> }> = [
      { path: `/activity/growth/tasks/${encodedCode}/claim`, body: {}, headers: growthWebHeaders },
      { path: `/v2/activity/growth/tasks/${encodedCode}/claim`, body: {}, headers: growthWebHeaders },
      { path: '/activity/growth/tasks/claim', body: { task_code: taskCode, taskCode }, headers: growthWebHeaders },
      { path: `/v2/activity/growth/tasks/${encodedCode}/receive`, body: {}, headers: growthWebHeaders },
    ];

    let lastRes: { ok: boolean; status: number; data: any } = { ok: false, status: 500, data: {} };

    for (const attempt of attempts) {
      const res = await this.request(
        attempt.path,
        'POST',
        credentials,
        authType,
        attempt.body,
        attempt.headers
      ).catch(() => ({ ok: false, status: 500, data: { error: 'network error' } }));

      lastRes = res;
      const msgText = String(res.data?.message || res.data?.msg || res.data?.error || '');
      const msgLower = msgText.toLowerCase();
      const alreadyClaimed =
        msgLower.includes('already claimed') ||
        msgLower.includes('already_claimed') ||
        msgLower.includes('已领取');

      if (this.isApiSuccess(res) || alreadyClaimed) {
        onStepLog?.(
          'success',
          `领奖接口 ${attempt.path} 成功 (HTTP ${res.status}${alreadyClaimed ? ', 奖励此前已领取' : ''})，正在补报收下奖励埋点`
        );
        // Report Growth Center reward modal confirmation telemetry ("收下奖励")
        await this.reportTelemetryEvents(
          [
            {
              eventCode: 'growth_task_claim_click',
              payload: { task_code: taskCode, source: 'growth_center' },
            },
            {
              eventCode: 'growth_task_claim_success',
              payload: { task_code: taskCode, source: 'growth_center' },
            },
          ],
          credentials,
          authType,
          extraHeaders
        ).catch(() => null);

        return {
          ok: true,
          status: res.status,
          data: res.data,
          endpoint: attempt.path,
          message: alreadyClaimed ? '该任务奖励已领取' : '奖励领取成功',
        };
      }

      onStepLog?.(
        'info',
        `领奖尝试 ${attempt.path} -> HTTP ${res.status}, code=${res.data?.code ?? '-'}, 提示=${msgText || '无'}`
      );

      // If official endpoint returned an explicit deterministic business rejection (e.g. HTTP 400 "task not completed"), stop trying deprecated fallbacks
      if (
        res.status === 400 &&
        (msgLower.includes('not completed') || msgLower.includes('not finished') || msgLower.includes('未完成'))
      ) {
        break;
      }
    }

    const errDetail =
      lastRes.data?.message ||
      lastRes.data?.msg ||
      lastRes.data?.error ||
      (lastRes.status === 401 ? 'Cookie/Token 已失效 (401)' : `HTTP ${lastRes.status}`);

    return {
      ok: false,
      status: lastRes.status,
      data: lastRes.data,
      message: String(errDetail),
    };
  }

  // 6. Fetch Cat Travel status
  public async getCatTravelStatus(
    credentials: string,
    authType: 'cookie' | 'token',
    extraHeaders?: Record<string, string>
  ) {
    return this.request(
      '/activity/growth/buddy/travel/status',
      'GET',
      credentials,
      authType,
      undefined,
      extraHeaders
    );
  }

  // 7. Depart on cat travel
  public async departCatTravel(
    locationId: string | number,
    credentials: string,
    authType: 'cookie' | 'token',
    extraHeaders?: Record<string, string>
  ) {
    return this.request(
      '/activity/growth/buddy/travel/depart',
      'POST',
      credentials,
      authType,
      {
        location_id: locationId,
      },
      extraHeaders
    );
  }

  // 8. Claim Cat Travel reward
  public async claimCatTravelReward(
    credentials: string,
    authType: 'cookie' | 'token',
    extraHeaders?: Record<string, string>
  ) {
    return this.request(
      '/activity/growth/buddy/travel/claim',
      'POST',
      credentials,
      authType,
      {},
      extraHeaders
    );
  }

  // 9. Real Daily Check-in & Streak (POST /billing/meter/daily-checkin + GET /activity/growth/streak)
  public async getDailyStreak(
    credentials: string,
    authType: 'cookie' | 'token',
    extraHeaders?: Record<string, string>
  ) {
    // 1. Check status via real billing meter check-in status API
    await this.request(
      '/billing/meter/checkin-status',
      'POST',
      credentials,
      authType,
      {},
      extraHeaders
    ).catch(() => null);

    // 2. Execute real daily check-in credit claim
    const dailyCheckinRes = await this.request(
      '/billing/meter/daily-checkin',
      'POST',
      credentials,
      authType,
      {},
      extraHeaders
    ).catch(() => null);

    // 3. Report telemetry for check-in
    await this.reportTelemetryEvents(
      [
        { eventCode: 'checkin_entry_show', payload: { source: 'growth_center' } },
        { eventCode: 'checkin_claim_click', payload: { source: 'growth_center' } },
        {
          eventCode: 'checkin_claim_result',
          payload: {
            source: 'growth_center',
            isSuccess: true,
            credit: dailyCheckinRes?.data?.data?.credit || 50,
          },
        },
      ],
      credentials,
      authType,
      extraHeaders
    ).catch(() => null);

    // 4. Fetch growth streak & heatmap
    await this.request('/activity/growth/heatmap', 'GET', credentials, authType, undefined, extraHeaders).catch(
      () => null
    );
    const streakRes = await this.request(
      '/activity/growth/streak',
      'GET',
      credentials,
      authType,
      undefined,
      extraHeaders
    );

    if (dailyCheckinRes?.ok && dailyCheckinRes.data?.code === 0) {
      return {
        ok: true,
        status: dailyCheckinRes.status,
        data: {
          ...streakRes.data,
          checkin: dailyCheckinRes.data.data,
        },
      };
    }

    return streakRes;
  }

  // Helper: create a cloud conversation, connect to its ACP sandbox session, send real session/prompt, and return delayed cleanup
  private async executeCloudConversationTurn(
    payload: Record<string, any>,
    promptText: string,
    credentials: string,
    authType: 'cookie' | 'token',
    desktopHeaders: Record<string, string>,
    onStepLog?: (level: 'info' | 'warn' | 'error' | 'success', message: string) => void
  ): Promise<{
    convId: string;
    hasRealConv: boolean;
    createStatus: number;
    messageSent: boolean;
    acpDetail: string;
    cleanup: () => Promise<void>;
  }> {
    const createBody: Record<string, any> = {
      prompt: String(promptText || '').slice(0, 100),
      model: 'deepseek-r1',
      conversationOrigin: payload.conversationOrigin || 'agents',
      plugins: [{ name: 'weixinpay', marketplace: 'codebuddy-builtin' }],
      ...(Array.isArray(payload.tags) && payload.tags.length > 0 ? { tags: payload.tags } : {}),
      ...(payload.expertId ? { expertId: payload.expertId, expert_id: payload.expertId } : {}),
      ...(payload.templateId ? { templateId: payload.templateId, template_id: payload.templateId } : {}),
    };

    onStepLog?.(
      'info',
      `正在调用 POST /console/as/conversations/ 创建云端沙箱会话 (origin=${createBody.conversationOrigin}${
        payload.expertId ? `, expertId=${payload.expertId}` : ''
      })...`
    );

    const res = await this.request(
      '/console/as/conversations/',
      'POST',
      credentials,
      authType,
      createBody,
      desktopHeaders
    ).catch(() => null);

    const convData = res?.data?.data && typeof res.data.data === 'object' ? res.data.data : res?.data;
    const realId = convData?.id || convData?.conversationId || convData?.conversation_id;
    const convId = String(realId || `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    const createStatus = res?.status || 0;

    let messageSent = false;
    let acpDetail = realId ? '未拿到沙箱 ACP 连接凭证' : `建会话未返回ID (HTTP ${createStatus})`;

    if (realId) {
      onStepLog?.('info', `云端会话创建成功：HTTP ${createStatus}, conversationId=${realId}`);
      let sessionInfo = convData?.session;
      if (!sessionInfo?.link || !sessionInfo?.token) {
        onStepLog?.('info', `建会话未直接内联 session，正在查询 /console/as/conversations/${realId}/session...`);
        const sessRes = await this.request(
          `/console/as/conversations/${encodeURIComponent(String(realId))}/session`,
          'GET',
          credentials,
          authType,
          undefined,
          desktopHeaders
        ).catch(() => null);
        sessionInfo = sessRes?.data?.data || sessRes?.data || sessionInfo;
        onStepLog?.(
          sessionInfo?.link ? 'info' : 'warn',
          `查询 /session 返回 HTTP ${sessRes?.status || 0}, link=${sessionInfo?.link ? '已获取' : '空'}, token=${
            sessionInfo?.token ? '已获取' : '空'
          }`
        );
      } else {
        onStepLog?.('info', `建会话已直接返回沙箱 session (sessionId=${sessionInfo.sessionId || realId})`);
      }

      const acpLink = sessionInfo?.link || sessionInfo?.endpoint || '';
      const acpToken = sessionInfo?.token || '';
      const acpSessionId = sessionInfo?.sessionId || sessionInfo?.session_id || String(realId);
      const acpCwd = sessionInfo?.cwd || '/workspace';

      if (acpLink && acpToken) {
        onStepLog?.('info', `正在连接沙箱 ACP 通道 (/acp/bootstrap -> session/prompt, sessionId=${acpSessionId})...`);
        const reqId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const acpPayload = {
          link: String(acpLink),
          token: String(acpToken),
          sessionId: String(acpSessionId),
          cwd: String(acpCwd),
          promptText,
          requestId: reqId,
        };

        try {
          const electronAPI = (window as unknown as {
            electronAPI?: {
              isElectron?: boolean;
              runAcpTurn?: (p: typeof acpPayload) => Promise<{
                ok: boolean;
                gotReply?: boolean;
                status?: number;
                detail?: string;
              }>;
            };
          }).electronAPI;

          let acpRes: { ok: boolean; gotReply?: boolean; status?: number; detail?: string } | null = null;
          if (electronAPI?.isElectron && typeof electronAPI.runAcpTurn === 'function') {
            acpRes = await electronAPI.runAcpTurn(acpPayload);
          } else {
            const webRes = await fetch('/api/workbuddy/acp-turn', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(acpPayload),
            });
            acpRes = await webRes.json().catch(() => null);
          }

          if (acpRes?.ok) {
            messageSent = true;
            acpDetail = acpRes.detail || 'ACP 沙箱对话发送成功';
            onStepLog?.('success', `ACP 沙箱对话结果：${acpDetail} (HTTP ${acpRes.status || 200})`);
          } else {
            acpDetail = acpRes?.detail || `ACP 对话失败 (HTTP ${acpRes?.status || 0})`;
            onStepLog?.('warn', `ACP 沙箱对话未成功：${acpDetail}`);
          }
        } catch (err: unknown) {
          acpDetail = `ACP 调用异常: ${err instanceof Error ? err.message : 'unknown'}`;
          onStepLog?.('warn', acpDetail);
        }
      } else {
        onStepLog?.('warn', `沙箱凭证缺失，无法发起 ACP 对话：link=${acpLink ? '有' : '无'}, token=${acpToken ? '有' : '无'}`);
      }
    } else {
      const errMsg = res?.data?.message || res?.data?.msg || res?.data?.error || '';
      onStepLog?.('warn', `云端会话创建未返回 ID：HTTP ${createStatus}${errMsg ? `, 原因=${errMsg}` : ''}`);
    }

    const cleanup = async () => {
      if (realId) {
        await this.request(
          `/console/as/conversations/${encodeURIComponent(String(realId))}/delete`,
          'POST',
          credentials,
          authType,
          { id: String(realId) },
          desktopHeaders
        ).catch(() => null);
      }
    };

    return { convId, hasRealConv: Boolean(realId), createStatus, messageSent, acpDetail, cleanup };
  }

  // Helper: fetch real experts / expert teams from official WorkBuddy CDN manifest & market endpoints
  private async resolveOfficialExperts(
    isTeam: boolean,
    specificExpertName: string | undefined,
    credentials: string,
    authType: 'cookie' | 'token',
    webApiHeaders: Record<string, string>,
    enterpriseId?: string,
    onStepLog?: (level: 'info' | 'warn' | 'error' | 'success', message: string) => void,
    taskJumpUrl?: string
  ): Promise<{
    experts: Array<{
      id: string;
      name: string;
      displayName: string;
      expertTitle: string;
      categoryId: string;
      expertType: 'agent' | 'team';
      version: string;
      source: string;
      defaultPrompt?: string;
      isTeam: boolean;
    }>;
    diagnostics: string[];
  }> {
    const collected: Array<{
      id: string;
      name: string;
      displayName: string;
      expertTitle: string;
      categoryId: string;
      expertType: 'agent' | 'team';
      version: string;
      source: string;
      defaultPrompt?: string;
      isTeam: boolean;
    }> = [];
    const seenIds = new Set<string>();
    const diagnostics: string[] = [];

    const pickLocalized = (val: any): string => {
      if (!val) return '';
      if (typeof val === 'string') return val.trim();
      if (typeof val === 'object') {
        return String(val.zh || val.zh_CN || val.en || val.name || '').trim();
      }
      return '';
    };

    const pushCandidate = (item: any, fallbackSource = 'builtin', forceTeam = false) => {
      if (!item || typeof item !== 'object') return;
      const id = String(item.expert_id || item.asset_id || item.team_id || item.id || '').trim();
      const displayNameZh = pickLocalized(item.displayName || item.display_name);
      const professionZh = pickLocalized(item.profession || item.title);
      const rawName = pickLocalized(item.name) || displayNameZh || professionZh || id;
      const shownName = displayNameZh || rawName;
      if (!id || !shownName) return;

      const expertTypeRaw = String(item.expertType || item.expert_type || item.type || '').toLowerCase();
      const itemIsTeam =
        forceTeam ||
        expertTypeRaw === 'team' ||
        item.asset_type === 'expert_team' ||
        item.is_team === true ||
        rawName.includes('团') ||
        shownName.includes('团') ||
        professionZh.includes('团');

      const defaultPrompt =
        pickLocalized(item.defaultInitPrompt || item.default_init_prompt) ||
        (Array.isArray(item.quickPrompts) && item.quickPrompts[0] ? pickLocalized(item.quickPrompts[0]) : '') ||
        undefined;

      if (!seenIds.has(id)) {
        seenIds.add(id);
        collected.push({
          id,
          name: rawName,
          displayName: shownName,
          expertTitle: professionZh || shownName,
          categoryId: String(item.categoryId || item.category_id || item.industryId || item.industry_id || ''),
          expertType: itemIsTeam ? 'team' : 'agent',
          version: String(item.version || item.expert_version || ''),
          source: String(item.source || fallbackSource),
          defaultPrompt,
          isTeam: itemIsTeam,
        });
      }
    };

    const extractMarketItems = (res: any): any[] => {
      const d = res?.data?.data || res?.data;
      if (!d || typeof d !== 'object') return [];
      if (Array.isArray(d)) return d;
      if (Array.isArray(d.scenes)) {
        const sceneExperts: any[] = [];
        for (const sc of d.scenes) {
          if (Array.isArray(sc?.experts)) {
            sceneExperts.push(...sc.experts);
          }
        }
        if (sceneExperts.length > 0) return sceneExperts;
      }
      if (d.results && typeof d.results === 'object' && !Array.isArray(d.results)) {
        const merged: any[] = [];
        for (const catGroup of Object.values(d.results) as any[]) {
          if (Array.isArray(catGroup?.experts)) {
            merged.push(...catGroup.experts);
          }
        }
        return merged;
      }
      const arr = d.items || d.experts || d.list || d.teams || d.records || [];
      return Array.isArray(arr) ? arr : [];
    };

    // 0. If task jump_url carries expert_id / expertId / id, resolve directly via get-by-ids
    const jumpExpertId = extractIdFromJumpUrl(taskJumpUrl, ['expert_id', 'expertId', 'agent_id', 'id']);
    if (jumpExpertId) {
      const directRes = await this.request(
        '/portal/operation-platform/market/expert/get-by-ids',
        'POST',
        credentials,
        authType,
        { expert_ids: [jumpExpertId], include_invisible: true },
        webApiHeaders
      ).catch(() => null);
      const directItems = extractMarketItems(directRes);
      if (directItems.length > 0) {
        diagnostics.push(`jump_url:${directItems.length}`);
        directItems.forEach((item) => pushCandidate(item, 'jump_url', isTeam));
      } else {
        pushCandidate({ id: jumpExpertId, name: specificExpertName || jumpExpertId }, 'jump_url', isTeam);
        diagnostics.push(`jump_url:1`);
      }
    }

    // Build normalized search keywords so partial/long titles like 「无畏契约拼豆专家」「商家宣传页与海报设计师」「腾讯轻量云」 match reliably
    const searchKeywords: string[] = [];
    if (specificExpertName) {
      const addKw = (k: string) => {
        const clean = k.trim();
        if (clean && !searchKeywords.includes(clean)) searchKeywords.push(clean);
      };
      addKw(specificExpertName);
      addKw(specificExpertName.replace(/(?:专家|设计师|助手|教练)$/g, ''));
      if (specificExpertName.includes('无畏契约')) addKw('无畏契约');
      if (specificExpertName.includes('商家宣传页')) addKw('商家宣传页');
      if (specificExpertName.includes('海报')) addKw('海报');
      if (specificExpertName.includes('轻量云')) addKw('轻量云');
    }

    onStepLog?.(
      'info',
      `正在检索官方${isTeam ? '专家团' : '专家'}列表${specificExpertName ? `（目标「${specificExpertName}」）` : ''}...`
    );

    // 1. Official Public Market Search/List APIs (with Web headers so APISIX never rejects Cookie with 401)
    for (const kw of searchKeywords) {
      const kwBody = {
        page: 1,
        page_size: 50,
        keyword: kw,
        sort_by: 'reco_rank',
        sort_order: 'desc',
        ...(isTeam ? { expert_type: 'team' } : {}),
      };
      let foundForKw = false;
      for (const path of ['/portal/operation-platform/market/expert/list', '/console/operation-platform/market/expert/list']) {
        const res = await this.request(path, 'POST', credentials, authType, kwBody, webApiHeaders).catch(() => null);
        const items = extractMarketItems(res);
        if (items.length > 0) {
          diagnostics.push(`${path}(${kw}):${items.length}`);
          items.forEach((item) => pushCandidate(item, 'market', isTeam));
          onStepLog?.('info', `检索 ${path} (keyword=${kw}) -> HTTP ${res?.status}, 获取 ${items.length} 条`);
          foundForKw = true;
          break;
        } else if (res?.status) {
          diagnostics.push(`${path}=HTTP${res.status}`);
          onStepLog?.('info', `检索 ${path} (keyword=${kw}) -> HTTP ${res.status}, 返回 0 条`);
        }
      }
      if (foundForKw && collected.length > 0) {
        // Check if we already found an exact/partial match for specificExpertName
        const needle = (specificExpertName || '').toLowerCase();
        const hit = collected.some(
          (e) =>
            e.displayName.toLowerCase().includes(needle) ||
            e.name.toLowerCase().includes(needle) ||
            needle.includes(e.displayName.toLowerCase()) ||
            needle.includes(e.name.toLowerCase())
        );
        if (hit) break;
      }
    }

    // Always also fetch general recommended page if target wasn't hit yet or running generic 5 experts / 3 teams
    if (!specificExpertName || collected.length === 0) {
      const listBody = {
        page: 1,
        page_size: 100,
        sort_by: 'reco_rank',
        sort_order: 'desc',
        ...(isTeam ? { expert_type: 'team' } : {}),
      };
      for (const path of ['/portal/operation-platform/market/expert/list', '/console/operation-platform/market/expert/list']) {
        const res = await this.request(path, 'POST', credentials, authType, listBody, webApiHeaders).catch(() => null);
        const items = extractMarketItems(res);
        if (items.length > 0) {
          diagnostics.push(`${path}:${items.length}`);
          items.forEach((item) => pushCandidate(item, 'market', isTeam));
          onStepLog?.('info', `检索 ${path} (推荐榜) -> HTTP ${res?.status}, 获取 ${items.length} 条`);
          break;
        } else if (res?.status) {
          diagnostics.push(`${path}=HTTP${res.status}`);
        }
      }
    }

    // 2. Enterprise Market List (when account has enterpriseId)
    if (enterpriseId) {
      const q = new URLSearchParams({
        source: 'builtin',
        page: '1',
        page_size: '100',
        ...(specificExpertName ? { keyword: specificExpertName } : {}),
      }).toString();
      for (const prefix of ['/portal', '/console']) {
        const res = await this.request(
          `${prefix}/enterprises/${encodeURIComponent(enterpriseId)}/expert-market/list?${q}`,
          'POST',
          credentials,
          authType,
          undefined,
          webApiHeaders
        ).catch(() => null);
        const items = extractMarketItems(res);
        if (items.length > 0) {
          diagnostics.push(`${prefix}/ent-market:${items.length}`);
          items.forEach((item) => pushCandidate(item, 'enterprise', isTeam));
          onStepLog?.('info', `检索企业市场 ${prefix}/expert-market -> 获取 ${items.length} 条`);
          break;
        }
      }
    }

    // 3. Official Static Marketplace Manifests (built-in, external, internal & featured scenes)
    const cdnUrls = [
      'https://acc-1258344699.cos.accelerate.myqcloud.com/workbuddy/expert-marketplace/expert_center.json',
      'https://acc-1258344699.cos.accelerate.myqcloud.com/workbuddy/expert-marketplace/externalExpert.json',
      'https://acc-1258344699.cos.accelerate.myqcloud.com/workbuddy/expert-marketplace/internalExpert.json',
      'https://acc-1258344699.cos.accelerate.myqcloud.com/workbuddy/expert-marketplace/featuredScenes.json',
    ];
    for (const cdnUrl of cdnUrls) {
      const cdnRes = await this.request(cdnUrl, 'GET', credentials, authType, undefined, {}).catch(() => null);
      const cdnExperts: any[] = [];
      if (Array.isArray(cdnRes?.data?.experts)) cdnExperts.push(...cdnRes.data.experts);
      if (Array.isArray(cdnRes?.data?.scenes)) {
        for (const sc of cdnRes.data.scenes) {
          if (Array.isArray(sc?.experts)) cdnExperts.push(...sc.experts);
        }
      }
      if (cdnExperts.length > 0) {
        diagnostics.push(`cdn:${cdnExperts.length}`);
        cdnExperts.forEach((item) => pushCandidate(item, 'builtin'));
      }
    }

    // 4. Official Featured, Category Batch & Ranking Endpoints
    const featuredRes = await this.request(
      '/api/v2/open-platform/featured',
      'POST',
      credentials,
      authType,
      {},
      webApiHeaders
    ).catch(() => null);
    const featuredItems = extractMarketItems(featuredRes);
    if (featuredItems.length > 0) {
      diagnostics.push(`featured:${featuredItems.length}`);
      featuredItems.forEach((item) => pushCandidate(item, 'featured'));
    }

    const rankRes = await this.request(
      '/portal/expert/ranking?limit=100',
      'GET',
      credentials,
      authType,
      undefined,
      webApiHeaders
    ).catch(() => null);
    const rankItems = extractMarketItems(rankRes);
    if (rankItems.length > 0) {
      diagnostics.push(`portal-ranking:${rankItems.length}`);
      rankItems.forEach((item) => pushCandidate(item, 'market'));
    }

    const catRes = await this.request(
      '/api/v2/open-platform/experts',
      'POST',
      credentials,
      authType,
      { template_id: 1, items: [] },
      webApiHeaders
    ).catch(() => null);
    const catItems = extractMarketItems(catRes);
    if (catItems.length > 0) {
      diagnostics.push(`open-platform-experts:${catItems.length}`);
      catItems.forEach((item) => pushCandidate(item, 'market'));
    }

    onStepLog?.('info', `专家池汇总完成：共去重收录 ${collected.length} 个候选（来源: ${diagnostics.join(', ') || '无'}）`);
    return { experts: collected, diagnostics };
  }

  // 10. Execute a specific growth task using real WorkBuddy production endpoints & /v2/report telemetry
  public async executeGrowthTask(
    task: WorkBuddyTask | WorkBuddyRawTask,
    credentials: string,
    authType: 'cookie' | 'token',
    extraHeaders?: Record<string, string>,
    onStepLog?: (level: 'info' | 'warn' | 'error' | 'success', message: string) => void
  ): Promise<{ triggered: boolean; claimed: boolean; status: number; detail: string }> {
    const taskCode = 'task_code' in task ? task.task_code : task.id;
    const title = ('title' in task ? task.title : task.name) || '';
    const targetCount =
      ('targetProgress' in task ? task.targetProgress : task.target_progress) ||
      (title.includes('5') ? 5 : title.includes('3') ? 3 : 1);

    const isAlreadyReadyToClaim =
      ('accept_status' in task && task.accept_status === 'completed') ||
      ('status' in task && task.status === '待领奖') ||
      ('currentProgress' in task &&
        'targetProgress' in task &&
        task.targetProgress > 0 &&
        task.currentProgress >= task.targetProgress &&
        task.status !== '已领奖');

    const taskJumpUrl = 'jump_url' in task ? task.jump_url : 'jumpUrl' in task ? task.jumpUrl : undefined;

    onStepLog?.('info', `开始处理任务 (task_code=${taskCode}, 目标进度=${targetCount})，正在解析账号身份...`);
    const identity = await this.resolveAccountIdentity(credentials, authType, extraHeaders);
    onStepLog?.(
      'info',
      `身份确认：uid=${identity.uid || '未知'}, nickname=${identity.nickname}${
        identity.enterpriseId ? `, enterpriseId=${identity.enterpriseId}` : ''
      }`
    );

    const desktopHeaders: Record<string, string> = {
      ...(extraHeaders || {}),
      'X-Client-Platform': 'web',
      'X-Submitted-From': 'web',
      Referer: 'https://www.workbuddy.cn/app',
      ...(identity.uid ? { 'X-User-Id': identity.uid } : {}),
    };

    // Fast path: if task is already completed ("领取奖励"), claim directly without re-running!
    if (isAlreadyReadyToClaim) {
      onStepLog?.('info', '服务端状态显示已达标，跳过执行步骤直接尝试领取奖励...');
      const directClaim = await this.claimTaskReward(taskCode, credentials, authType, extraHeaders, onStepLog);
      if (directClaim.ok) {
        return {
          triggered: true,
          claimed: true,
          status: directClaim.status,
          detail: `任务已达标，成功自动领取奖励！(${directClaim.endpoint || 'claim'})`,
        };
      }
      return {
        triggered: true,
        claimed: false,
        status: directClaim.status,
        detail: `任务已达标，但领奖接口未通过: ${directClaim.message}`,
      };
    }

    // Step 1: Ensure task is accepted in Growth Center
    const acceptRes = await this.acceptTasks([taskCode], credentials, authType, extraHeaders).catch(() => null);
    onStepLog?.('info', `步骤1: 确认接取任务 (/activity/growth/tasks/accept) -> HTTP ${acceptRes?.status || 0}`);

    let anyTriggerOk = false;
    let traceDetail = '';
    const pendingCleanups: Array<() => Promise<void>> = [];

    // =========================================================================
    // Category A: 关注「腾讯 WorkBuddy」官方公众号
    // =========================================================================
    if (title.includes('公众号')) {
      const subRes = await this.request(
        '/v2/activity/growth/subscribe-task/status',
        'GET',
        credentials,
        authType,
        undefined,
        desktopHeaders
      );
      if (subRes.ok) anyTriggerOk = true;

      const claimRes = await this.claimTaskReward(taskCode, credentials, authType, desktopHeaders);
      const claimed =
        claimRes.ok &&
        claimRes.data?.code === 0 &&
        !String(claimRes.data?.message || '').toLowerCase().includes('not');

      return {
        triggered: anyTriggerOk,
        claimed,
        status: claimRes.status,
        detail: claimed
          ? '公众号关注满 24 小时核验通过，成功领取 100 积分！'
          : '已同步公众号关注状态（需微信扫码关注满 24 小时后即可直接领奖）',
      };
    }

    // =========================================================================
    // Category B: 探索优秀灵感 (Playbook / Inspiration)
    // =========================================================================
    if (title.includes('探索优秀灵感') || title.includes('灵感')) {
      const queriesRes = await this.request(
        '/api/v1/artifact-recommend/v1/home/queries',
        'GET',
        credentials,
        authType,
        undefined,
        desktopHeaders
      );
      if (queriesRes.ok) anyTriggerOk = true;

      const items =
        queriesRes.data?.data?.queries ||
        queriesRes.data?.data?.items ||
        queriesRes.data?.data ||
        [];
      const firstInsp = Array.isArray(items) && items[0] ? items[0] : {};
      const inspId = String(firstInsp.id || firstInsp.case_id || 'official_case_1');
      const inspName = String(firstInsp.title || firstInsp.name || '智能办公效率助手');
      const inspPrompt = String(firstInsp.prompt || firstInsp.query || '帮我生成一份本周工作总结与下周计划');

      await this.request(
        '/v2/as/inspiration/code/decode',
        'POST',
        credentials,
        authType,
        { code: inspId },
        desktopHeaders
      ).catch(() => null);

      const turn = await this.executeCloudConversationTurn(
        {
          prompt: inspPrompt,
          tags: ['playbook', `inspiration:${inspId}`],
        },
        inspPrompt,
        credentials,
        authType,
        desktopHeaders,
        onStepLog
      );
      const convId = turn.convId;
      pendingCleanups.push(turn.cleanup);
      if (turn.messageSent) anyTriggerOk = true;
      const reqId = `req_${Date.now()}`;

      const repRes = await this.reportTelemetryEvents(
        [
          {
            eventCode: 'playbook_cta_click',
            payload: {
              id: inspId,
              name: inspName,
              type: 'working',
              source: 'home',
              position: 0,
            },
          },
          {
            eventCode: 'playbook_prompt_send',
            payload: {
              id: inspId,
              name: inspName,
              type: 'working',
              promptLength: inspPrompt.length,
              isOfficial: 1,
              conversationId: convId,
              requestId: reqId,
            },
          },
          {
            eventCode: 'agent_task_created',
            payload: {
              mode: 'LOCAL',
              isCustomModel: true,
              conversation_id: convId,
              request_id: reqId,
              source: 'playbook',
            },
          },
        ],
        credentials,
        authType,
        desktopHeaders
      );
      if (repRes.ok) anyTriggerOk = true;
    }

    // =========================================================================
    // Category C: 体验 WorkBuddy「发现应用」 (Buddy Application 5.5.3+)
    // =========================================================================
    else if (title.includes('发现应用')) {
      const appListRes = await this.request(
        '/workbuddyopen/v1/authorize/applications',
        'POST',
        credentials,
        authType,
        { page: 1, page_size: 20 },
        desktopHeaders
      );
      const buddyListRes = await this.request(
        '/api/v1/open-platform/buddy_application',
        'GET',
        credentials,
        authType,
        undefined,
        desktopHeaders
      );
      await this.request(
        '/api/v2/open-platform/buddy/entrance',
        'GET',
        credentials,
        authType,
        undefined,
        desktopHeaders
      ).catch(() => null);

      const apps =
        appListRes.data?.data?.list ||
        appListRes.data?.data?.applications ||
        buddyListRes.data?.data?.list ||
        buddyListRes.data?.data?.items ||
        buddyListRes.data?.data ||
        [];
      const firstApp = Array.isArray(apps) && apps[0] ? apps[0] : {};
      const appId = String(firstApp.application_id || firstApp.id || firstApp.app_id || 'buddy_app_official_1');
      const appName = String(firstApp.name || firstApp.title || 'WorkBuddy 办公助手');

      const detailRes = await this.request(
        `/api/v1/open-platform/buddy_application/detail?application_id=${encodeURIComponent(appId)}`,
        'GET',
        credentials,
        authType,
        undefined,
        desktopHeaders
      );
      if (detailRes.ok || appListRes.ok || buddyListRes.ok) anyTriggerOk = true;

      const usageRes = await this.request(
        '/api/v2/open-platform/asset-usage/report',
        'POST',
        credentials,
        authType,
        {
          asset_id: appId,
          asset_type: 'buddy_app',
          asset_kind: 'buddy_application',
          action: 'enter',
        },
        desktopHeaders
      );
      if (usageRes.ok) anyTriggerOk = true;

      const repRes = await this.reportTelemetryEvents(
        [
          {
            eventCode: 'buddyapp_discover_click',
            payload: { buddyId: appId, buddyName: appName },
          },
          {
            eventCode: 'buddyapp_show',
            payload: { buddyId: appId, buddyName: appName, elementId: appId, elementName: appName },
          },
          {
            eventCode: 'buddyapp_enter_click',
            payload: { buddyId: appId, buddyName: appName, elementId: appId, elementName: appName },
          },
        ],
        credentials,
        authType,
        desktopHeaders
      );
      if (repRes.ok) anyTriggerOk = true;
    }

    // =========================================================================
    // Category D1: 分享一个技能给好友 (Skill Share 5.9.0+)
    // =========================================================================
    else if (title.includes('分享') && title.includes('技能')) {
      const skillsRes = await this.request(
        '/api/v2/open-platform/skills',
        'GET',
        credentials,
        authType,
        undefined,
        desktopHeaders
      );
      const searchRes = await this.request(
        '/api/v2/open-platform/skills/search',
        'POST',
        credentials,
        authType,
        { keyword: '', page: 1, page_size: 10 },
        desktopHeaders
      );

      const skillList =
        skillsRes.data?.data?.list ||
        skillsRes.data?.data?.items ||
        skillsRes.data?.data ||
        searchRes.data?.data?.list ||
        searchRes.data?.data?.items ||
        [];
      const firstSkill = Array.isArray(skillList) && skillList[0] ? skillList[0] : {};
      const skillId = String(firstSkill.asset_id || firstSkill.skill_id || firstSkill.id || 'builtin_web_search');
      const skillName = String(firstSkill.name || firstSkill.title || '网页搜索与总结');
      const traceId = `share_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Call real C2C skill share channel generation endpoint
      const shareRes = await this.request(
        '/api/v2/open-platform/asset-shares/c2c/channels',
        'POST',
        credentials,
        authType,
        {
          asset_kind: 'skill',
          asset_source: 'market',
          asset_ref: JSON.stringify({ asset_id: skillId, id: skillId, name: skillName }),
          ways: ['link', 'wxacode', 'wxapath'],
          extra: {
            from: 'pc',
            traceId,
          },
        },
        desktopHeaders
      );
      if (shareRes.ok) anyTriggerOk = true;

      await this.request(
        '/api/v2/open-platform/asset-usage/report',
        'POST',
        credentials,
        authType,
        {
          asset_id: skillId,
          asset_type: 'skill',
          action: 'share',
        },
        desktopHeaders
      ).catch(() => null);

      const repRes = await this.reportTelemetryEvents(
        [
          {
            eventCode: 'skill_detail_show',
            payload: { skillName, skillId, traceId, from: 'market' },
          },
          {
            eventCode: 'skill_share_entry_click',
            payload: { skillName, skillId, traceId, from: 'detail' },
          },
          {
            eventCode: 'skill_share_channel_action',
            payload: {
              skillName,
              skillId,
              traceId,
              action: 'link',
              panelAction: 'click',
              isSuccessful: true,
              shareToken: shareRes.data?.data?.share_token || traceId,
            },
          },
          {
            eventCode: 'skill_share_channel_action',
            payload: {
              skillName,
              skillId,
              traceId,
              action: 'link',
              panelAction: 'success',
              isSuccessful: true,
              shareToken: shareRes.data?.data?.share_token || traceId,
            },
          },
        ],
        credentials,
        authType,
        desktopHeaders
      );
      if (repRes.ok) anyTriggerOk = true;
    }

    // =========================================================================
    // Category D2: 尝鲜热门技能 (安装并使用 1 个技能 - 官方 /v2/user-asset/skill/install)
    // =========================================================================
    else if (title.includes('技能') || title.includes('尝鲜')) {
      const skillsRes = await this.request(
        '/api/v2/open-platform/skills?source=builtin&page=1&page_size=20',
        'GET',
        credentials,
        authType,
        undefined,
        desktopHeaders
      ).catch(() => null);
      const searchRes = await this.request(
        '/api/v2/open-platform/skills/search',
        'POST',
        credentials,
        authType,
        { keyword: '', page: 1, page_size: 20 },
        desktopHeaders
      ).catch(() => null);
      const skillhubRes = await this.request(
        'https://api.skillhub.cn/api/skills?page=1&pageSize=20',
        'GET',
        credentials,
        authType,
        undefined,
        {}
      ).catch(() => null);

      const workbuddySkillList =
        skillsRes?.data?.data?.list ||
        skillsRes?.data?.data?.items ||
        skillsRes?.data?.data ||
        searchRes?.data?.data?.list ||
        searchRes?.data?.data?.items ||
        [];
      const skillhubList =
        skillhubRes?.data?.data?.skills ||
        skillhubRes?.data?.data?.list ||
        skillhubRes?.data?.skills ||
        skillhubRes?.data?.data ||
        [];

      const useWorkBuddySkill = Array.isArray(workbuddySkillList) && workbuddySkillList.length > 0;
      const firstSkill = useWorkBuddySkill
        ? workbuddySkillList[0]
        : Array.isArray(skillhubList) && skillhubList[0]
        ? skillhubList[0]
        : {};

      const skillId = String(
        firstSkill.asset_id || firstSkill.skill_id || firstSkill.slug || firstSkill.id || 'find-skills'
      );
      const skillName = String(firstSkill.name || firstSkill.title || '热门办公技能');
      const skillVersion = String(firstSkill.version || firstSkill.latest_version || '1.0.0');
      const skillSource = String(
        firstSkill.source || (useWorkBuddySkill ? 'market' : 'skillhub')
      );

      onStepLog?.(
        'info',
        `步骤2: 已锁定热门技能「${skillName}」(id=${skillId}, version=${skillVersion}, source=${skillSource})，调用官方 POST /v2/user-asset/skill/install 安装...`
      );

      const installRes = await this.request(
        '/v2/user-asset/skill/install',
        'POST',
        credentials,
        authType,
        {
          items: [
            {
              source: skillSource === 'skillhub' ? 'skillhub' : 'market',
              asset_id: skillId,
              version: skillVersion,
            },
          ],
        },
        desktopHeaders
      ).catch(() => null);

      onStepLog?.(
        installRes?.ok ? 'success' : 'warn',
        `官方技能安装接口 /v2/user-asset/skill/install -> HTTP ${installRes?.status || 0}, code=${
          installRes?.data?.code ?? '-'
        }`
      );
      if (installRes?.ok) anyTriggerOk = true;

      await this.request(
        '/api/v2/open-platform/asset-usage/report',
        'POST',
        credentials,
        authType,
        {
          asset_id: skillId,
          asset_name: skillName,
          asset_type: 'skill',
          action: 'install',
        },
        desktopHeaders
      ).catch(() => null);

      const skillPrompt = `请使用技能「${skillName}」(${skillId}) 帮我整理一份今日重点待办摘要。`;
      const turn = await this.executeCloudConversationTurn(
        {
          prompt: skillPrompt,
          skillId,
          skillName,
          tags: [`skill:${skillId}`],
        },
        skillPrompt,
        credentials,
        authType,
        desktopHeaders,
        onStepLog
      );
      pendingCleanups.push(turn.cleanup);
      if (turn.messageSent) anyTriggerOk = true;

      await this.request(
        '/api/v2/open-platform/asset-usage/report',
        'POST',
        credentials,
        authType,
        {
          asset_id: skillId,
          asset_name: skillName,
          asset_type: 'skill',
          action: 'use',
        },
        desktopHeaders
      ).catch(() => null);

      const reqId = `req_${Date.now()}`;
      const repRes = await this.reportTelemetryEvents(
        [
          {
            eventCode: 'skill_detail_show',
            payload: { skillName, name: skillName, skillId, skillVersion, source: skillSource },
          },
          {
            eventCode: 'skill_installed',
            payload: { name: skillName, skillName, skillId, skillVersion, source: skillSource },
          },
          {
            eventCode: 'skill_action',
            payload: {
              name: skillName,
              skillId,
              skillVersion,
              action: 'install',
              channelType: skillSource === 'skillhub' ? 'skillhub' : 'builtin',
            },
          },
          {
            eventCode: 'skill_request_send',
            payload: {
              name: skillName,
              skillId,
              conversationId: turn.convId,
              requestId: reqId,
            },
          },
          {
            eventCode: 'agent_task_created',
            payload: {
              mode: 'CLOUD',
              isCustomModel: false,
              conversationId: turn.convId,
              conversation_id: turn.convId,
              requestId: reqId,
              request_id: reqId,
              skill_id: skillId,
              skill_name: skillName,
            },
          },
          {
            eventCode: 'chat_request_send',
            payload: { conversationId: turn.convId, requestId: reqId, skillId },
          },
          {
            eventCode: 'chat_response_complete',
            payload: {
              conversationId: turn.convId,
              conversation_id: turn.convId,
              requestId: reqId,
              request_id: reqId,
              skill_id: skillId,
            },
          },
        ],
        credentials,
        authType,
        desktopHeaders
      );
      onStepLog?.(
        repRes.ok ? 'info' : 'warn',
        `上报技能使用埋点 /v2/report (skill_installed, skill_action, skill_request_send) -> HTTP ${repRes.status}`
      );
      if (repRes.ok) anyTriggerOk = true;
    }

    // =========================================================================
    // Category E: 设置自动化任务 (Scheduler / Automated Task)
    // =========================================================================
    else if (title.includes('自动化任务')) {
      const assistantRes = await this.request(
        '/v2/user/cloudagent/default-assistant',
        'GET',
        credentials,
        authType,
        undefined,
        desktopHeaders
      ).catch(() => null);
      const assistantId = assistantRes?.data?.data?.id || assistantRes?.data?.id || 'default';

      const schedulePayload = {
        name: '每日工作待办自动整理',
        title: '每日工作待办自动整理',
        prompt: '请帮我汇总今日重点工作待办事项',
        cron: '0 9 * * *',
        schedule_type: 'daily',
        schedule_time: '09:00',
        enabled: true,
        assistant_id: assistantId,
      };

      const schedRes1 = await this.request(
        '/v2/as/scheduler/tasks',
        'POST',
        credentials,
        authType,
        schedulePayload,
        desktopHeaders
      );
      const schedRes2 = await this.request(
        '/webapi/scheduler/tasks',
        'POST',
        credentials,
        authType,
        schedulePayload,
        desktopHeaders
      );
      if (schedRes1.ok || schedRes2.ok) anyTriggerOk = true;

      const createdTaskId =
        schedRes1.data?.data?.id ||
        schedRes1.data?.id ||
        schedRes2.data?.data?.id ||
        schedRes2.data?.id ||
        `sched_${Date.now()}`;

      const repRes = await this.reportTelemetryEvents(
        [
          {
            eventCode: 'automated_task_create_suc',
            payload: {
              task_id: String(createdTaskId),
              task_name: schedulePayload.name,
              schedule_type: 'daily',
            },
          },
          {
            eventCode: 'automated_task_action',
            payload: {
              action: 'create',
              task_id: String(createdTaskId),
              task_name: schedulePayload.name,
            },
          },
        ],
        credentials,
        authType,
        desktopHeaders
      );
      if (repRes.ok) anyTriggerOk = true;

      // Clean up temporary scheduled task if it was created on server so we don't spam user's schedule list
      if (schedRes1.data?.data?.id || schedRes1.data?.id) {
        const realSchedId = schedRes1.data?.data?.id || schedRes1.data?.id;
        await this.request(
          `/v2/as/scheduler/tasks/${realSchedId}`,
          'DELETE',
          credentials,
          authType,
          undefined,
          desktopHeaders
        ).catch(() => null);
      }
    }

    // =========================================================================
    // Category F: 使用 5 个模板 (Use 5 Agent Templates)
    // =========================================================================
    else if (title.includes('模板')) {
      const tplRes = await this.request(
        '/v2/user/cloudagent/agents/templates',
        'GET',
        credentials,
        authType,
        undefined,
        desktopHeaders
      );
      if (tplRes.ok) anyTriggerOk = true;

      const rawTemplates =
        tplRes.data?.data?.templates ||
        tplRes.data?.data?.list ||
        tplRes.data?.data?.items ||
        tplRes.data?.data ||
        [];

      const fallbackTemplates = [
        { id: 'tpl_weekly_report', name: '周报生成器', prompt: '请帮我生成一份本周工作周报模板' },
        { id: 'tpl_ppt_outline', name: 'PPT大纲生成', prompt: '请帮我生成一份项目汇报PPT大纲' },
        { id: 'tpl_data_analysis', name: '数据分析助手', prompt: '请帮我分析这组业务增长数据的核心结论' },
        { id: 'tpl_meeting_minutes', name: '会议纪要整理', prompt: '请帮我将会议要点整理为结构化纪要' },
        { id: 'tpl_copywriting', name: '爆款文案创作', prompt: '请帮我撰写一篇新品发布宣传文案' },
      ];

      const count = Math.max(targetCount, 5);
      for (let i = 0; i < count; i++) {
        const tpl = (Array.isArray(rawTemplates) && rawTemplates[i]) || fallbackTemplates[i % fallbackTemplates.length];
        const tplId = String(tpl.id || tpl.template_id || `tpl_${i + 1}`);
        const tplName = String(tpl.name || tpl.title || `官方模板 ${i + 1}`);
        const tplPrompt = String(tpl.prompt || tpl.description || `使用模板「${tplName}」生成示例内容`);
        const actionId = `${tplId}:${i}`;

        onStepLog?.('info', `第 ${i + 1}/${count} 轮：正在使用模板「${tplName}」(id=${tplId}) 创建云端对话...`);
        const turn = await this.executeCloudConversationTurn(
          {
            prompt: tplPrompt,
            templateId: tplId,
            tags: [`template:${tplId}`],
          },
          tplPrompt,
          credentials,
          authType,
          desktopHeaders,
          onStepLog
        );
        const convId = turn.convId;
        pendingCleanups.push(turn.cleanup);
        if (turn.messageSent) anyTriggerOk = true;
        const reqId = `req_${Date.now()}_${i}`;

        await this.request(
          '/api/v2/open-platform/asset-usage/report',
          'POST',
          credentials,
          authType,
          {
            asset_id: tplId,
            asset_type: 'template',
            action: 'use',
          },
          desktopHeaders
        ).catch(() => null);

        const repRes = await this.reportTelemetryEvents(
          [
            {
              eventCode: 'agent_template_clicked',
              payload: { id: actionId, template_id: tplId, name: tplName, position: i },
            },
            {
              eventCode: 'template_used',
              payload: { id: actionId, template_id: tplId, name: tplName },
            },
            {
              eventCode: 'agent_task_created_with_template',
              payload: {
                mode: 'LOCAL',
                isCustomModel: true,
                id: actionId,
                name: tplName,
                conversationId: convId,
                requestId: reqId,
              },
            },
            {
              eventCode: 'agent_task_created',
              payload: {
                mode: 'LOCAL',
                isCustomModel: true,
                conversation_id: convId,
                request_id: reqId,
                has_template: true,
                action: actionId,
                template_id: tplId,
                template_name: tplName,
              },
            },
            {
              eventCode: 'chat_response_complete',
              payload: {
                conversation_id: convId,
                request_id: reqId,
                has_template: true,
                template_id: tplId,
              },
            },
          ],
          credentials,
          authType,
          desktopHeaders
        );
        if (repRes.ok) anyTriggerOk = true;
      }
    }

    // =========================================================================
    // Category G1: 体验「资料库」 (官方 NetDrive / TDrive / my-files + 官方埋点)
    // =========================================================================
    else if (title.includes('资料库')) {
      onStepLog?.('info', '步骤2: 正在访问官方资料库接口 (/console/as/netdrive/access-token, /v2/as/netdisk/shares)...');
      const netdriveTokenRes = await this.request(
        '/console/as/netdrive/access-token',
        'POST',
        credentials,
        authType,
        {},
        desktopHeaders
      ).catch(() => null);
      if (netdriveTokenRes?.ok) anyTriggerOk = true;

      await this.request(
        '/console/as/netdrive/nicknames',
        'POST',
        credentials,
        authType,
        {},
        desktopHeaders
      ).catch(() => null);

      const sharesRes = await this.request(
        '/v2/as/netdisk/shares?page=1&pageSize=10',
        'GET',
        credentials,
        authType,
        undefined,
        desktopHeaders
      ).catch(() => null);
      if (sharesRes?.ok) anyTriggerOk = true;

      const ndData = netdriveTokenRes?.data?.data || netdriveTokenRes?.data || {};
      const ndBaseUrl = typeof ndData.baseUrl === 'string' ? ndData.baseUrl.replace(/\/$/, '') : '';
      const ndToken = typeof ndData.accessToken === 'string' ? ndData.accessToken : '';
      if (ndBaseUrl && ndToken) {
        const ndHeaders = { Authorization: `Bearer ${ndToken}` };
        const appListRes = await this.request(
          `${ndBaseUrl}/api/v6/open/tdrive/drive/app-list`,
          'GET',
          credentials,
          authType,
          undefined,
          ndHeaders
        ).catch(() => null);
        if (appListRes?.ok) anyTriggerOk = true;
        await this.request(
          `${ndBaseUrl}/api/v6/open/tdrive/dir/list`,
          'POST',
          credentials,
          authType,
          { page: 1, page_size: 20 },
          ndHeaders
        ).catch(() => null);
        await this.request(
          `${ndBaseUrl}/api/v6/open/agent/manage/list_file`,
          'POST',
          credentials,
          authType,
          { path: '/', page: 1, page_size: 20 },
          ndHeaders
        ).catch(() => null);
      } else {
        await this.request(
          '/api/v6/open/tdrive/drive/app-list',
          'GET',
          credentials,
          authType,
          undefined,
          desktopHeaders
        ).catch(() => null);
      }

      await this.request(
        '/api/v2/open-platform/asset-usage/report',
        'POST',
        credentials,
        authType,
        {
          asset_id: 'library',
          asset_name: 'WorkBuddy 资料库介绍',
          asset_type: 'library',
          action: 'enter',
        },
        desktopHeaders
      ).catch(() => null);

      onStepLog?.('info', '步骤3: 正在创建云端会话并发起资料库功能咨询对话...');
      const kbPrompt = '请介绍一下 WorkBuddy 资料库（我的文件与云盘同步）的核心功能和使用方法。';
      const turn = await this.executeCloudConversationTurn(
        { prompt: kbPrompt, tags: ['knowledge_base', 'my_files'] },
        kbPrompt,
        credentials,
        authType,
        desktopHeaders,
        onStepLog
      );
      pendingCleanups.push(turn.cleanup);
      if (turn.messageSent) anyTriggerOk = true;
      const reqId = `req_${Date.now()}`;

      const repRes = await this.reportTelemetryEvents(
        [
          { eventCode: 'web_page_show', payload: { page: 'library/my-files', source: 'growth_center' } },
          { eventCode: 'asset_list_show', payload: { source: 'library/my-files', assetType: 'library' } },
          { eventCode: 'asset_cloud_list_show', payload: { source: 'library/my-files' } },
          { eventCode: 'asset_cloud_sync', payload: { source: 'library/my-files', docTitle: 'WorkBuddy 资料库介绍' } },
          { eventCode: 'docs_view', payload: { docTitle: 'WorkBuddy 资料库介绍', source: 'library' } },
          {
            eventCode: 'agent_task_created',
            payload: { mode: 'CLOUD', conversationId: turn.convId, requestId: reqId, source: 'library' },
          },
          { eventCode: 'chat_request_send', payload: { conversationId: turn.convId, requestId: reqId, source: 'library' } },
          {
            eventCode: 'chat_response_complete',
            payload: { conversationId: turn.convId, requestId: reqId, source: 'library' },
          },
        ],
        credentials,
        authType,
        desktopHeaders
      );
      onStepLog?.(
        repRes.ok ? 'info' : 'warn',
        `上报资料库官方埋点 /v2/report (web_page_show, asset_cloud_list_show, asset_cloud_sync) -> HTTP ${repRes.status}`
      );
      if (repRes.ok) anyTriggerOk = true;
    }

    // =========================================================================
    // Category G2: 和 AI 聊天 5 次 / 桌面端对话 1 次 / 领取一只 Buddy
    // =========================================================================
    else if (
      title.includes('AI 聊天') ||
      title.includes('AI聊天') ||
      title.includes('桌面端对话') ||
      title.includes('领取一只') ||
      (title.includes('对话') && !title.includes('体验「') && !title.includes('专家'))
    ) {
      const count = title.includes('5') ? Math.max(targetCount, 5) : Math.max(targetCount, 1);
      const chatPrompts = [
        '你好，请帮我列举 3 条高效办公的时间管理技巧。',
        '帮我把「完成本周工作总结」拆分成 3 个可执行的步骤。',
        '请用一句话总结如何提升团队协作效率。',
        '帮我生成一段简洁的项目进度汇报开头。',
        '给我推荐 2 个提升日常文档写作质量的方法。',
      ];

      for (let i = 0; i < count; i++) {
        onStepLog?.('info', `第 ${i + 1}/${count} 轮 AI 对话：正在创建云端会话并发送 ACP 消息...`);
        const promptText = chatPrompts[i % chatPrompts.length];
        const turn = await this.executeCloudConversationTurn(
          {
            prompt: promptText,
            conversationOrigin: 'desktop',
            tags: ['daily_chat', title.includes('桌面端') ? 'desktop_chat' : 'ai_chat'],
          },
          promptText,
          credentials,
          authType,
          desktopHeaders,
          onStepLog
        );
        pendingCleanups.push(turn.cleanup);
        if (turn.messageSent) anyTriggerOk = true;
        const reqId = `req_${Date.now()}_${i}`;

        const repRes = await this.reportTelemetryEvents(
          [
            {
              eventCode: 'agent_task_created',
              payload: {
                mode: turn.hasRealConv ? 'CLOUD' : 'LOCAL',
                isCustomModel: false,
                conversationId: turn.convId,
                conversation_id: turn.convId,
                requestId: reqId,
                request_id: reqId,
                source: 'desktop',
              },
            },
            {
              eventCode: 'chat_request_send',
              payload: {
                conversationId: turn.convId,
                requestId: reqId,
                promptLength: promptText.length,
                source: 'desktop',
              },
            },
            {
              eventCode: 'chat_response_complete',
              payload: {
                conversationId: turn.convId,
                conversation_id: turn.convId,
                requestId: reqId,
                request_id: reqId,
                isSuccess: true,
              },
            },
          ],
          credentials,
          authType,
          desktopHeaders
        );
        if (repRes.ok) anyTriggerOk = true;
        traceDetail = `建会话=${turn.createStatus},ACP=${turn.acpDetail},report=${repRes.status}`;
      }
    }

    // =========================================================================
    // Category G3: 体验「XXX专家」 / 召唤 5 次专家 / 召唤 3 次专家团
    // =========================================================================
    else {
      const isTeam = title.includes('专家团');
      const specificMatch = title.match(/体验「([^」]+)」/);
      const specificExpertName = specificMatch ? specificMatch[1] : undefined;

      const resolved = await this.resolveOfficialExperts(
        isTeam,
        specificExpertName,
        credentials,
        authType,
        desktopHeaders,
        identity.enterpriseId,
        onStepLog,
        taskJumpUrl
      );
      const allExperts = resolved.experts;
      const teamPool = allExperts.filter((e) => e.isTeam);
      const effectivePool = isTeam && teamPool.length > 0 ? teamPool : allExperts;

      const iterations = specificExpertName ? 1 : Math.max(targetCount, isTeam ? 3 : 5);
      const usedExpertIds = new Set<string>();
      const iterLogs: string[] = [];

      const normalizeExpertStr = (s: string) =>
        String(s || '')
          .toLowerCase()
          .replace(/[「」\[\]\s·_\-—:：()（）]/g, '');

      for (let i = 0; i < iterations; i++) {
        let chosen: (typeof allExperts)[number] | undefined;

        if (specificExpertName) {
          const needle = specificExpertName.toLowerCase();
          const normNeedle = normalizeExpertStr(specificExpertName);
          const normShort = normalizeExpertStr(specificExpertName.replace(/(?:专家|设计师|助手|教练)$/g, ''));
          chosen =
            allExperts.find(
              (e) =>
                e.displayName.toLowerCase() === needle ||
                e.name.toLowerCase() === needle ||
                e.expertTitle.toLowerCase() === needle ||
                e.id.toLowerCase() === needle ||
                normalizeExpertStr(e.displayName) === normNeedle ||
                normalizeExpertStr(e.name) === normNeedle
            ) ||
            allExperts.find(
              (e) =>
                e.displayName.toLowerCase().includes(needle) ||
                e.name.toLowerCase().includes(needle) ||
                e.expertTitle.toLowerCase().includes(needle) ||
                needle.includes(e.displayName.toLowerCase()) ||
                needle.includes(e.name.toLowerCase()) ||
                needle.includes(e.expertTitle.toLowerCase()) ||
                normalizeExpertStr(e.displayName).includes(normShort) ||
                normalizeExpertStr(e.name).includes(normShort) ||
                normShort.includes(normalizeExpertStr(e.displayName))
            );
        } else {
          chosen =
            effectivePool.find((e) => !usedExpertIds.has(e.id)) ||
            effectivePool[i % Math.max(effectivePool.length, 1)];
        }

        const expertId = chosen?.id || '';
        const targetName =
          chosen?.displayName || chosen?.name || specificExpertName || (isTeam ? `专家团队 ${i + 1}` : `官方专家 ${i + 1}`);
        const expertTitle = chosen?.expertTitle || targetName;
        const expertCategory = chosen?.categoryId || '';
        const expertType = chosen?.expertType || (isTeam ? 'team' : 'agent');
        const expertVersion = chosen?.version || '';
        const expertSource = chosen?.source || 'builtin';
        if (expertId) {
          usedExpertIds.add(expertId);
        }

        onStepLog?.(
          expertId ? 'info' : 'warn',
          `第 ${i + 1}/${iterations} 轮召唤：目标=「${targetName}」, 命中ID=${expertId || '未命中'}, type=${expertType}, source=${expertSource}`
        );

        // Fetch detail via official get-by-ids endpoint if market expert found
        if (expertId) {
          const detailRes = await this.request(
            '/portal/operation-platform/market/expert/get-by-ids',
            'POST',
            credentials,
            authType,
            { expert_ids: [expertId], include_invisible: false },
            desktopHeaders
          ).catch(() => null);
          onStepLog?.('info', `拉取专家详情 /market/expert/get-by-ids -> HTTP ${detailRes?.status || 0}`);
        }

        if (specificExpertName && (specificExpertName.includes('轻量云') || specificExpertName.includes('连接器'))) {
          const connRes = await this.request(
            '/api/v2/open-platform/connectors?page=1&pageSize=20',
            'GET',
            credentials,
            authType,
            undefined,
            desktopHeaders
          ).catch(() => null);
          onStepLog?.(
            'info',
            `检索连接器状态 /open-platform/connectors -> HTTP ${connRes?.status || 0}`
          );
        }

        const promptText =
          chosen?.defaultPrompt ||
          `你好，请作为「${targetName}」简单介绍一下你的核心能力并给出一个实用示例。`;

        const turn = await this.executeCloudConversationTurn(
          {
            prompt: promptText,
            ...(expertId ? { expertId, expert_id: expertId } : {}),
            expertName: targetName,
            expertType,
            tags: expertId ? [`expert:${expertId}`, `expert_name:${targetName}`] : [`expert_name:${targetName}`],
          },
          promptText,
          credentials,
          authType,
          desktopHeaders,
          onStepLog
        );
        const convId = turn.convId;
        pendingCleanups.push(turn.cleanup);
        if (turn.messageSent) anyTriggerOk = true;
        const reqId = `req_${Date.now()}_${i}`;
        const msgId = `msg_${Date.now()}_${i}`;

        let usageOk = false;
        if (expertId) {
          const usageRes = await this.request(
            '/api/v2/open-platform/asset-usage/report',
            'POST',
            credentials,
            authType,
            {
              asset_id: expertId,
              asset_name: targetName,
              asset_type: isTeam ? 'expert_team' : 'expert',
              action: 'summon',
            },
            desktopHeaders
          ).catch(() => null);
          onStepLog?.(
            usageRes?.ok ? 'info' : 'warn',
            `上报资产使用 /asset-usage/report -> HTTP ${usageRes?.status || 0}, code=${usageRes?.data?.code ?? '-'}`
          );
          if (usageRes?.ok) {
            anyTriggerOk = true;
            usageOk = true;
          }
        }

        // Report exact official CloudProductMetricsReporter events from main-D4DaPwsz.js
        const reportEvents: Array<{ eventCode: string; payload?: Record<string, any> }> = [
          ...(expertId
            ? [
                {
                  eventCode: 'expert_detail_show',
                  payload: {
                    id: expertId,
                    name: targetName,
                    expertTitle,
                    type: expertCategory,
                    expertType,
                    version: expertVersion,
                  },
                },
                {
                  eventCode: isTeam ? 'expert_team_summon' : 'expert_summon_click',
                  payload: {
                    id: expertId,
                    name: targetName,
                    expertTitle,
                    type: expertCategory || (isTeam ? 'team' : 'expert'),
                    position: i + 1,
                    expertType,
                    version: expertVersion,
                  },
                },
                {
                  eventCode: 'expert_summoned',
                  payload: {
                    id: expertId,
                    name: targetName,
                    expertTitle,
                    type: expertCategory,
                    version: expertVersion,
                  },
                },
                {
                  eventCode: 'expert_actual_use',
                  payload: {
                    mode: 'CLOUD',
                    id: expertId,
                    name: targetName,
                    expertTitle,
                    type: expertCategory,
                    expertType,
                    source: expertSource,
                    version: expertVersion,
                    cost: 800,
                    characterCount: promptText.length,
                    conversationId: convId,
                    requestId: reqId,
                    messageId: msgId,
                    requestModelId: 'deepseek-r1',
                    requestModelName: 'deepseek-r1',
                  },
                },
              ]
            : []),
          {
            eventCode: 'agent_task_created',
            payload: {
              mode: 'CLOUD',
              isCustomModel: false,
              conversationId: convId,
              requestId: reqId,
              source: 'expert',
            },
          },
          {
            eventCode: 'chat_request_send',
            payload: {
              conversationId: convId,
              requestId: reqId,
              source: 'expert',
            },
          },
          {
            eventCode: 'chat_response_complete',
            payload: {
              conversationId: convId,
              requestId: reqId,
              artifactType: 'none',
              source: 'expert',
            },
          },
        ];

        const repRes = await this.reportTelemetryEvents(reportEvents, credentials, authType, desktopHeaders);
        onStepLog?.(
          repRes.ok ? 'info' : 'warn',
          `上报官方埋点 /v2/report (${reportEvents.map((e) => e.eventCode).join(', ')}) -> HTTP ${repRes.status}, code=${
            repRes.data?.code ?? '-'
          }`
        );
        if (repRes.ok && expertId && turn.messageSent) anyTriggerOk = true;

        iterLogs.push(
          `#${i + 1}[ID=${expertId || '未命中'},建会话=${turn.createStatus},ACP=${turn.acpDetail},usage=${usageOk},report=${repRes.status}]`
        );
      }

      traceDetail = `检索源(${resolved.diagnostics.join(',') || '无'}) ${iterLogs.join('; ')}`;
    }

    // Give official server enough time to settle sandbox ACP message & async task counters before checking & cleaning up
    onStepLog?.('info', '操作执行完毕，等待 1.5s 让服务端异步结算任务计数，随后尝试自动领奖...');
    await new Promise((r) => setTimeout(r, 1500));

    // Step 3: Attempt to claim reward right away
    let claimRes = await this.claimTaskReward(taskCode, credentials, authType, extraHeaders, onStepLog);
    let claimed = claimRes.ok;

    // Step 4: Re-fetch /v2/activity/growth/tasks to verify real server-side progress and status
    onStepLog?.('info', '正在回查 /v2/activity/growth/tasks 核验服务端最新进度与领奖状态...');
    const verifyRes = await this.getGrowthTasks(credentials, authType, extraHeaders).catch(() => null);
    const rawTasks: WorkBuddyRawTask[] =
      verifyRes?.data?.data?.tasks || verifyRes?.data?.tasks || verifyRes?.data?.data || [];
    const updatedRaw = Array.isArray(rawTasks)
      ? rawTasks.find((t) => t.task_code === taskCode || t.title === title)
      : undefined;

    // Clean up temporary conversations AFTER verification so server sees active dialogue turns first
    if (pendingCleanups.length > 0) {
      onStepLog?.('info', `正在清理 ${pendingCleanups.length} 个临时云端测试会话...`);
      for (const cleanupFn of pendingCleanups) {
        await cleanupFn().catch(() => null);
      }
    }

    if (updatedRaw) {
      const mapped = mapRawTaskToWorkBuddyTask(updatedRaw);
      onStepLog?.(
        mapped.currentProgress >= mapped.targetProgress ? 'success' : 'warn',
        `服务端核验结果：进度 ${mapped.currentProgress}/${mapped.targetProgress}, accept_status=${updatedRaw.accept_status}, 映射状态=${mapped.status}`
      );
      if (mapped.status === '已领奖') {
        claimed = true;
      } else if (
        updatedRaw.accept_status === 'completed' ||
        mapped.status === '待领奖' ||
        (mapped.targetProgress > 0 && mapped.currentProgress >= mapped.targetProgress)
      ) {
        onStepLog?.('info', '核验发现进度已满但未领奖，正在二次触发领奖接口...');
        const retryClaim = await this.claimTaskReward(taskCode, credentials, authType, extraHeaders, onStepLog);
        claimRes = retryClaim;
        if (retryClaim.ok) {
          claimed = true;
        }
      }

      if (!claimed) {
        return {
          triggered: anyTriggerOk,
          claimed: false,
          status: claimRes.status,
          detail:
            mapped.currentProgress >= mapped.targetProgress
              ? `任务进度已达标 (${mapped.currentProgress}/${mapped.targetProgress})，但自动领奖返回: ${claimRes.message}`
              : `服务端当前进度: ${mapped.currentProgress}/${mapped.targetProgress}（提示: ${claimRes.message}）${
                  traceDetail ? ` | 诊断: ${traceDetail}` : ''
                }`,
        };
      }
    }

    return {
      triggered: anyTriggerOk,
      claimed,
      status: claimRes.status,
      detail: claimed
        ? '成功完成任务并自动领取积分奖励！'
        : anyTriggerOk
        ? `已执行沙箱对话与官方埋点 (${claimRes.message})，正在等待服务端结算进度${
            traceDetail ? ` | 诊断: ${traceDetail}` : ''
          }`
        : `触发未完成 (${claimRes.message})${traceDetail ? ` | 诊断: ${traceDetail}` : ''}`,
    };
  }
}

export const OFFICIAL_TASK_DESCRIPTIONS: Record<string, { desc: string; target: number; reward: number }> = {
  探索优秀灵感: {
    desc: '体验1款「灵感」优秀案例。(PC · 截止 11.13 · 100 Credits + 5 能量)',
    target: 1,
    reward: 100,
  },
  '体验 WorkBuddy 「发现应用」': {
    desc: '升级到电脑端5.5.3或以上版本，点击左上角「发现应用」进入任意一个 Buddy 应用。(截止 11.13)',
    target: 1,
    reward: 100,
  },
  '关注「腾讯 WorkBuddy」官方公众号': {
    desc: '关注「腾讯 WorkBuddy」官方公众号满 24 小时，即可领取奖励。(100 Credits + 5 能量)',
    target: 1,
    reward: 100,
  },
  '体验「无畏契约拼豆专家」': {
    desc: '即日起至11月13日，在专家页搜索并召唤「无畏契约拼豆专家」，完成一次对话。(100 Credits + 5 能量)',
    target: 1,
    reward: 100,
  },
  '体验「中国电商运营专家」': {
    desc: '在专家页搜索并召唤「中国电商运营专家」，完成一次对话。(截止 11.13 · 50 Credits + 5 能量)',
    target: 1,
    reward: 50,
  },
  '体验「抖音策略师」': {
    desc: '在专家页搜索并召唤「抖音策略师」，完成一次对话。(截止 11.13 · 50 Credits + 5 能量)',
    target: 1,
    reward: 50,
  },
  '体验「商家宣传页与海报设计师」': {
    desc: '在专家页搜索并召唤「商家宣传页与海报设计师」，完成一次对话。(截止 11.13 · 50 Credits + 5 能量)',
    target: 1,
    reward: 50,
  },
  '体验「直播电商教练」': {
    desc: '在专家页搜索并召唤「直播电商教练」，完成一次对话。(截止 11.13 · 50 Credits + 5 能量)',
    target: 1,
    reward: 50,
  },
  分享一个技能给好友: {
    desc: '升级到电脑端至5.9.0或以上版本，前往「技能」列表点击任意一个技能，进入详情页通过「分享」发送技能给好友。(截止 11.18)',
    target: 1,
    reward: 100,
  },
  '召唤 3 次专家团': {
    desc: '切换至「专家团」，召唤并使用 3 个不同的专家团队。(截止 11.13 · 100 Credits + 5 能量)',
    target: 3,
    reward: 100,
  },
  '召唤 5 次专家': {
    desc: '召唤 5 位不同的专家并发起对话。(截止 11.13 · 智囊团长 · 100 Credits + 5 能量)',
    target: 5,
    reward: 100,
  },
  '使用 5 个模板': {
    desc: '「新建任务」并使用 5 个不同的模板并发起对话。(截止 11.13 · 模板达人 · 100 Credits + 5 能量)',
    target: 5,
    reward: 100,
  },
  设置自动化任务: {
    desc: '设置 1 个自动化任务。(截止 11.13 · 自动高手 · 100 Credits + 5 能量)',
    target: 1,
    reward: 100,
  },
  '和 AI 聊天 5 次': {
    desc: '和AI对话累计 5 次。(截止 11.13 · 话唠本唠 · 100 Credits + 5 能量)',
    target: 5,
    reward: 100,
  },
  尝鲜热门技能: {
    desc: '安装并使用 1 个技能。(截止 11.13 · 尝鲜达人 · 100 Credits + 5 能量)',
    target: 1,
    reward: 100,
  },
  '体验「资料库」': {
    desc: '前往「资料库」，读完《WorkBuddy 资料库介绍》这篇文档。(100 Credits + 5 能量)',
    target: 1,
    reward: 100,
  },
  '体验「腾讯轻量云」专家': {
    desc: '召唤专家，在对话框上方授权连接器后，对话一次。(截止 11.13 · 100 Credits + 5 能量)',
    target: 1,
    reward: 100,
  },
  桌面端对话1次: {
    desc: '下载并使用桌面端，即可解锁限定款 Buddy 盲盒。(100 Credits + 5 能量)',
    target: 1,
    reward: 100,
  },
};

export function toSafeNumber(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim() !== '') {
    const parsed = Number(val.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function sanitizeTaskProgress(task: WorkBuddyTask): WorkBuddyTask {
  const title = (task.name || '').trim();
  const preset = OFFICIAL_TASK_DESCRIPTIONS[title];
  const fallbackTarget = preset?.target ?? (title.includes('5') ? 5 : title.includes('3') ? 3 : 1);
  const safeTarget = toSafeNumber(task.targetProgress) ?? fallbackTarget;
  const safeCurrent =
    toSafeNumber(task.currentProgress) ?? (task.status === '已领奖' || task.status === '待领奖' ? safeTarget : 0);

  return {
    ...task,
    currentProgress: safeCurrent,
    targetProgress: safeTarget,
  };
}

export function mapRawTaskToWorkBuddyTask(rt: any): WorkBuddyTask {
  const title = (rt.title || rt.name || rt.task_name || rt.task_code || '').trim();
  const preset = OFFICIAL_TASK_DESCRIPTIONS[title];

  const rawStatus = String(rt.accept_status || rt.status || '').toLowerCase();
  const isClaimed = rawStatus === 'claimed' || rawStatus === 'rewarded';
  const isCompleted =
    rawStatus === 'completed' ||
    rawStatus === 'finished' ||
    rawStatus === 'done' ||
    rt.can_claim === true ||
    rt.claimable === true;

  const progObj = rt.progress && typeof rt.progress === 'object' ? rt.progress : null;
  const progStrMatch =
    typeof rt.progress === 'string' ? rt.progress.match(/^(\d+)\s*\/\s*(\d+)$/) : null;

  const targetProgress =
    toSafeNumber(rt.target_progress) ??
    toSafeNumber(rt.total_progress) ??
    toSafeNumber(rt.target_count) ??
    toSafeNumber(rt.total_count) ??
    toSafeNumber(progObj?.target) ??
    toSafeNumber(progObj?.total) ??
    toSafeNumber(progObj?.target_progress) ??
    (progStrMatch ? Number(progStrMatch[2]) : null) ??
    toSafeNumber(rt.target) ??
    preset?.target ??
    (title.includes('5') ? 5 : title.includes('3') ? 3 : 1);

  let currentProgress =
    toSafeNumber(rt.current_progress) ??
    toSafeNumber(rt.current_count) ??
    toSafeNumber(rt.finish_count) ??
    toSafeNumber(progObj?.current) ??
    toSafeNumber(progObj?.count) ??
    toSafeNumber(progObj?.current_progress) ??
    (progStrMatch ? Number(progStrMatch[1]) : null) ??
    toSafeNumber(rt.progress) ??
    (isClaimed || isCompleted ? targetProgress : 0);

  if ((isClaimed || isCompleted) && currentProgress < targetProgress) {
    currentProgress = targetProgress;
  }

  const isProgressFull = targetProgress > 0 && currentProgress >= targetProgress;

  const reward = toSafeNumber(rt.reward_credit) ?? toSafeNumber(rt.reward) ?? preset?.reward ?? 100;
  const officialDesc =
    rt.task_desc ||
    rt.description ||
    rt.sub_title ||
    rt.desc ||
    rt.tips ||
    preset?.desc ||
    '官方成长计划任务';

  let status: WorkBuddyTask['status'] = '进行中';
  if (isClaimed) {
    status = '已领奖';
  } else if (isCompleted || isProgressFull) {
    status = '待领奖';
  } else if (title.includes('公众号')) {
    status = '需人工';
  } else if (rawStatus === 'not_accepted') {
    status = '未完成';
  } else {
    status = '进行中';
  }

  return {
    id: rt.task_code || rt.id || title,
    name: title,
    status,
    currentProgress,
    targetProgress,
    reward,
    recentResult: isClaimed
      ? '已领取奖励'
      : status === '待领奖'
      ? '已达标待领奖 (点击[立即领奖])'
      : title.includes('公众号')
      ? '扫码关注满24h领奖'
      : '待执行 / 可点[一键完成]',
    reason: officialDesc,
    autoExecutable: !title.includes('公众号') || status === '待领奖',
    jumpUrl: rt.jump_url || rt.jumpUrl || undefined,
  };
}

export const workbuddyRealApi = new WorkBuddyRealApi();
