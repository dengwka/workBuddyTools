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

export class WorkBuddyRealApi {
  private baseUrl = 'https://www.workbuddy.cn';

  private getHeaders(credentials: string, authType: 'cookie' | 'token'): Record<string, string> {
    const clean = credentials.trim();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain, */*',
      'X-Client-Platform': 'web',
    };

    if (authType === 'token' || clean.startsWith('ey') || clean.startsWith('Bearer ')) {
      const token = clean.replace(/^Bearer\s+/i, '');
      headers['Authorization'] = `Bearer ${token}`;
      // Some endpoints check cookie as well
      headers['Cookie'] = `wb_token=${token}; token=${token}; Authorization=${token}`;
    } else {
      // Cookie mode
      headers['Cookie'] = clean;
      // Extract token from cookie string if present
      const tokenMatch = clean.match(/(?:wb_token|token|Authorization)=([^;]+)/i);
      if (tokenMatch) {
        headers['Authorization'] = `Bearer ${tokenMatch[1]}`;
      }
    }

    return headers;
  }

  // Sends request through our backend proxy or direct
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
