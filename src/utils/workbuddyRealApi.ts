import { WorkBuddyTask, CatTravelInfo } from '../types/workbuddy';

export interface WorkBuddyRawTask {
  task_code: string;
  task_type: string;
  title: string;
  description?: string;
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

function getCredentialCacheKey(cred: string): string {
  const trimmed = (cred || '').trim();
  const sessMatch = trimmed.match(/session=([^;\s]{16,64})/);
  if (sessMatch && sessMatch[1]) {
    return `sess_${sessMatch[1]}`;
  }
  return `cred_${trimmed.slice(0, 64)}`;
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
  // Remove accidental line-continuation backslashes or newlines from multiline copy
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

    // Extract all -H / --header flags across the entire cURL command
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

    // Extract -b '...' or -b "..." or --cookie '...'
    const bRegex = /(?:-b|--cookie)\s+(?:'([^']*)'|"([^"]*)"|(\S+))/gi;
    let bMatch: RegExpExecArray | null;
    while ((bMatch = bRegex.exec(cleaned)) !== null) {
      const bVal = (bMatch[1] ?? bMatch[2] ?? bMatch[3] ?? '').trim();
      if (bVal) {
        cookieFromCurl = cookieFromCurl ? `${cookieFromCurl}; ${bVal}` : bVal;
      }
    }

    // Detect method & data from cURL if present
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

  // 5. If it looks like a cookie (contains '=' and ';' or 'session=')
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
    skipRealmAutoComplete = false
  ): Record<string, string> {
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
      Origin: 'https://www.workbuddy.cn',
      Referer: 'https://www.workbuddy.cn/profile/plans-usage',
      ...mergedExtra,
    };

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
    const headers = this.getHeaders(credentials, authType, extraHeaders, skipRealmAutoComplete);

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

  // 1. Fetch current user info
  public async getUserInfo(
    credentials: string,
    authType: 'cookie' | 'token',
    extraHeaders?: Record<string, string>
  ) {
    return this.request('/users/self', 'GET', credentials, authType, undefined, extraHeaders);
  }

  // 2. Fetch real resource / credit / points summary with automatic POST / GET & cookie fallback
  public async getResourceSummary(
    credentials: string,
    authType: 'cookie' | 'token',
    extraHeaders?: Record<string, string>
  ) {
    const parsed = extractCleanCredentials(credentials, authType);
    const mergedHeaders = { ...(parsed.extraHeaders || {}), ...(extraHeaders || {}) };

    // Try 1: POST with body (or cURL specified method/body) and normalized Cookie (with cb_login_mode=v2; cb_login_realm=copilot)
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

    // Try 2: Alternate HTTP method (GET if POST failed, POST if GET failed)
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

    // Try 3: Raw cookie without auto-completed prefix in case session signature is bound to exact cookie order
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

  // 3. Fetch all growth center tasks
  public async getGrowthTasks(
    credentials: string,
    authType: 'cookie' | 'token',
    extraHeaders?: Record<string, string>
  ) {
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

  // 5. Claim reward for a completed task
  public async claimTaskReward(
    taskCode: string,
    credentials: string,
    authType: 'cookie' | 'token',
    extraHeaders?: Record<string, string>
  ) {
    return this.request(
      `/activity/growth/tasks/${taskCode}/claim`,
      'POST',
      credentials,
      authType,
      {},
      extraHeaders
    );
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

  // 9. Daily check-in / streak
  public async getDailyStreak(
    credentials: string,
    authType: 'cookie' | 'token',
    extraHeaders?: Record<string, string>
  ) {
    return this.request('/activity/growth/streak', 'GET', credentials, authType, undefined, extraHeaders);
  }
}

export const workbuddyRealApi = new WorkBuddyRealApi();
