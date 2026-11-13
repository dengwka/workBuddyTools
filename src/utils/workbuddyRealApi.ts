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

export function extractCleanCredentials(
  rawInput: string,
  currentAuthType: 'cookie' | 'token' = 'cookie'
): { credentials: string; authType: 'cookie' | 'token'; isExtractedFromCurl?: boolean } {
  let cleaned = (rawInput || '').trim();
  if (!cleaned) {
    return { credentials: '', authType: currentAuthType };
  }

  // 1. Detect cURL command from Chrome DevTools or curl CLI
  if (
    cleaned.startsWith('curl') ||
    cleaned.includes('-b ') ||
    cleaned.includes('--cookie') ||
    /-[Hh]\s+['"]cookie:/i.test(cleaned)
  ) {
    // Check -b '...' or -b "..." or --cookie '...'
    const bMatch =
      cleaned.match(/(?:-b|--cookie)\s+['"]([^'"]+)['"]/i) ||
      cleaned.match(/(?:-b|--cookie)\s+(\S+)/i);
    if (bMatch && bMatch[1]) {
      return { credentials: bMatch[1].trim(), authType: 'cookie', isExtractedFromCurl: true };
    }
    // Check -H 'cookie: ...'
    const hCookieMatch = cleaned.match(/-H\s+['"]cookie:\s*([^'"]+)['"]/i);
    if (hCookieMatch && hCookieMatch[1]) {
      return { credentials: hCookieMatch[1].trim(), authType: 'cookie', isExtractedFromCurl: true };
    }
    // Check -H 'authorization: Bearer ...'
    const hAuthMatch = cleaned.match(/-H\s+['"]authorization:\s*Bearer\s+([^'"]+)['"]/i);
    if (hAuthMatch && hAuthMatch[1]) {
      return { credentials: hAuthMatch[1].trim(), authType: 'token', isExtractedFromCurl: true };
    }
  }

  // 2. Strip leading "Cookie: " or "cookie: "
  if (/^cookie:\s*/i.test(cleaned)) {
    cleaned = cleaned.replace(/^cookie:\s*/i, '').trim();
    return { credentials: cleaned, authType: 'cookie' };
  }

  // 3. Strip leading "Authorization: Bearer " or "Bearer "
  if (/^(?:authorization:\s*)?bearer\s+/i.test(cleaned)) {
    cleaned = cleaned.replace(/^(?:authorization:\s*)?bearer\s+/i, '').trim();
    return { credentials: cleaned, authType: 'token' };
  }

  // 4. Strip wrapping single or double quotes
  if (
    (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
    (cleaned.startsWith('"') && cleaned.endsWith('"'))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // 5. If it looks like a cookie (contains '=' and ';')
  if (cleaned.includes(';') && cleaned.includes('=')) {
    return { credentials: cleaned, authType: 'cookie' };
  }

  // 6. If it looks like a JWT token
  if (cleaned.startsWith('ey') && !cleaned.includes(';')) {
    return { credentials: cleaned, authType: 'token' };
  }

  return { credentials: cleaned, authType: currentAuthType };
}

export class WorkBuddyRealApi {
  private baseUrl = 'https://www.workbuddy.cn';

  private getHeaders(credentials: string, authType: 'cookie' | 'token'): Record<string, string> {
    const cleanInfo = extractCleanCredentials(credentials, authType);
    const clean = cleanInfo.credentials;
    const finalAuthType = cleanInfo.authType;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'X-Client-Platform': 'web',
      Origin: 'https://www.workbuddy.cn',
      Referer: 'https://www.workbuddy.cn/profile/plans-usage',
    };

    if (finalAuthType === 'token') {
      const token = clean.replace(/^Bearer\s+/i, '');
      headers['Authorization'] = `Bearer ${token}`;
      headers['Cookie'] = `token=${token}; wb_token=${token}`;
    } else {
      // Pure Cookie mode: strictly DO NOT include Authorization header to avoid APISIX token mismatch
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
    body?: any
  ): Promise<{ ok: boolean; status: number; data: any }> {
    const targetUrl = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const headers = this.getHeaders(credentials, authType);

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
  public async getUserInfo(credentials: string, authType: 'cookie' | 'token') {
    return this.request('/users/self', 'GET', credentials, authType);
  }

  // 2. Fetch real resource / credit / points summary
  public async getResourceSummary(credentials: string, authType: 'cookie' | 'token') {
    return this.request('/billing/meter/get-user-resource-summary', 'POST', credentials, authType, {});
  }

  // 3. Fetch all growth center tasks
  public async getGrowthTasks(credentials: string, authType: 'cookie' | 'token') {
    return this.request('/v2/activity/growth/tasks', 'GET', credentials, authType);
  }

  // 4. Accept task(s)
  public async acceptTasks(taskCodes: string[], credentials: string, authType: 'cookie' | 'token') {
    return this.request('/activity/growth/tasks/accept', 'POST', credentials, authType, {
      task_codes: taskCodes,
    });
  }

  // 5. Claim reward for a completed task
  public async claimTaskReward(taskCode: string, credentials: string, authType: 'cookie' | 'token') {
    return this.request(`/activity/growth/tasks/${taskCode}/claim`, 'POST', credentials, authType, {});
  }

  // 6. Fetch Cat Travel status
  public async getCatTravelStatus(credentials: string, authType: 'cookie' | 'token') {
    return this.request('/activity/growth/buddy/travel/status', 'GET', credentials, authType);
  }

  // 7. Depart on cat travel
  public async departCatTravel(locationId: string | number, credentials: string, authType: 'cookie' | 'token') {
    return this.request('/activity/growth/buddy/travel/depart', 'POST', credentials, authType, {
      location_id: locationId,
    });
  }

  // 8. Claim Cat Travel reward
  public async claimCatTravelReward(credentials: string, authType: 'cookie' | 'token') {
    return this.request('/activity/growth/buddy/travel/claim', 'POST', credentials, authType, {});
  }

  // 9. Daily check-in / streak
  public async getDailyStreak(credentials: string, authType: 'cookie' | 'token') {
    return this.request('/activity/growth/streak', 'GET', credentials, authType);
  }
}

export const workbuddyRealApi = new WorkBuddyRealApi();
