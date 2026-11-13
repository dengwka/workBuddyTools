import { WorkBuddyAccount, ExecutionLog } from '../types/workbuddy';
import { workbuddyRealApi, WorkBuddyRawTask, mapRawTaskToWorkBuddyTask } from './workbuddyRealApi';

export class AutomationEngine {
  private isCancelled = false;

  public cancel() {
    this.isCancelled = true;
  }

  public resetCancel() {
    this.isCancelled = false;
  }

  private async syncLivePointsFromServer(
    account: WorkBuddyAccount,
    creds: string,
    authType: 'cookie' | 'token',
    extraHeaders?: Record<string, string>
  ): Promise<number | null> {
    const resourceRes = await workbuddyRealApi.getResourceSummary(creds, authType, extraHeaders);
    if (resourceRes.ok && resourceRes.data) {
      const resData = resourceRes.data.data || resourceRes.data;
      const totalPoints =
        resData.TotalCredits ??
        resData.total_credit ??
        resData.balance ??
        resData.platform_reward_credit ??
        resData.available_credits;

      if (totalPoints !== undefined && totalPoints !== null) {
        account.points = Number(totalPoints);
        account.lastUpdated = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        return account.points;
      }
    }
    return null;
  }

  // Execute tasks connecting to real WorkBuddy APIs
  public async runDailyTasks(
    accounts: WorkBuddyAccount[],
    onProgress: (
      log: ExecutionLog,
      updatedAccounts: WorkBuddyAccount[],
      statsDelta: { successes: number; fails: number; skips: number }
    ) => void
  ): Promise<WorkBuddyAccount[]> {
    this.resetCancel();
    const updated = JSON.parse(JSON.stringify(accounts)) as WorkBuddyAccount[];

    let successes = 0;
    let fails = 0;
    let skips = 0;

    for (let accIdx = 0; accIdx < updated.length; accIdx++) {
      if (this.isCancelled) {
        onProgress(
          {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            accountId: updated[accIdx].id,
            level: 'warn',
            message: `[${updated[accIdx].id}] 用户中断了任务批处理执行`,
          },
          updated,
          { successes, fails, skips }
        );
        break;
      }

      const account = updated[accIdx];
      account.status = '运行中';

      onProgress(
        {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          accountId: account.id,
          level: 'info',
          message: `[${account.id}] 正在向 https://www.workbuddy.cn 发起真实接口鉴权...`,
        },
        updated,
        { successes, fails, skips }
      );

      const creds = account.credentials || '';
      const authType = account.authType || 'cookie';
      const extraHeaders = account.extraHeaders;

      // 1. Fetch real user profile
      const userProfileRes = await workbuddyRealApi.getUserInfo(creds, authType, extraHeaders);
      if (userProfileRes.ok && userProfileRes.data) {
        const u = userProfileRes.data.data || userProfileRes.data;
        if (u.nickname || u.username || u.name) {
          account.nickname = u.nickname || u.username || u.name;
          onProgress(
            {
              id: Math.random().toString(36).substring(2, 9),
              timestamp: new Date().toLocaleTimeString(),
              accountId: account.id,
              level: 'success',
              message: `[${account.id}] 官方账号认证成功，当前用户：${account.nickname}`,
            },
            updated,
            { successes, fails, skips }
          );
        }
      }

      // 2. Fetch real user points & credits balance from official server
      const initialLivePoints = await this.syncLivePointsFromServer(account, creds, authType, extraHeaders);
      if (initialLivePoints !== null) {
        onProgress(
          {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            accountId: account.id,
            level: 'info',
            message: `[${account.id}] 成功同步 WorkBuddy 官方实时积分：${account.points} 积分`,
          },
          updated,
          { successes, fails, skips }
        );
      } else {
        const checkRes = await workbuddyRealApi.getResourceSummary(creds, authType, extraHeaders);
        if (checkRes.status === 401) {
          fails++;
          account.status = '异常';
          onProgress(
            {
              id: Math.random().toString(36).substring(2, 9),
              timestamp: new Date().toLocaleTimeString(),
              accountId: account.id,
              level: 'error',
              message: `[${account.id}] 官方接口返回 401 Unauthorized：Cookie 或 Token 已失效，请双击账号更新凭据`,
            },
            updated,
            { successes, fails, skips }
          );
        }
      }

      // 3. Fetch real Cat Travel status & auto depart / claim + real-time API points sync
      if (account.catTravel.autoTravel) {
        onProgress(
          {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            accountId: account.id,
            level: 'info',
            message: `[${account.id}] 正在查询猫猫旅行官方状态 (/activity/growth/buddy/travel/status)...`,
          },
          updated,
          { successes, fails, skips }
        );

        const travelStatusRes = await workbuddyRealApi.getCatTravelStatus(creds, authType, extraHeaders);
        if (travelStatusRes.ok && travelStatusRes.data) {
          const tData = travelStatusRes.data.data || travelStatusRes.data;
          if (tData.can_claim || tData.status === 'completed' || tData.status === 'finished') {
            const claimRes = await workbuddyRealApi.claimCatTravelReward(creds, authType, extraHeaders);
            if (claimRes.ok) {
              successes++;
              account.catTravel.status = '今日已完成';
              account.catTravel.lastResult = '猫猫旅行完成并已领取奖励！';
              await this.syncLivePointsFromServer(account, creds, authType, extraHeaders);
              onProgress(
                {
                  id: Math.random().toString(36).substring(2, 9),
                  timestamp: new Date().toLocaleTimeString(),
                  accountId: account.id,
                  level: 'success',
                  message: `[${account.id}] 成功领取猫猫旅行奖励，已调官方服务实时刷新积分：${account.points}`,
                },
                updated,
                { successes, fails, skips }
              );
            }
          } else if (tData.status === 'ready' || tData.status === 'idle' || tData.can_depart) {
            const departRes = await workbuddyRealApi.departCatTravel(1, creds, authType, extraHeaders);
            if (departRes.ok) {
              successes++;
              account.catTravel.status = '今日已完成';
              account.catTravel.lastResult = '猫猫已成功启程旅行！';
              await this.syncLivePointsFromServer(account, creds, authType, extraHeaders);
              onProgress(
                {
                  id: Math.random().toString(36).substring(2, 9),
                  timestamp: new Date().toLocaleTimeString(),
                  accountId: account.id,
                  level: 'success',
                  message: `[${account.id}] 猫猫已自动出发旅行，当前官方实时积分：${account.points}`,
                },
                updated,
                { successes, fails, skips }
              );
            }
          } else if (tData.daily_limit_reached || tData.status === 'daily_limit_reached') {
            skips++;
            account.catTravel.status = '今日已完成';
            account.catTravel.detailMessage = '猫猫今日已完成旅行 (服务端标记 daily_limit_reached)';
            account.catTravel.lastResult = '猫猫今日旅行次数已达上限，无需重复执行';
            onProgress(
              {
                id: Math.random().toString(36).substring(2, 9),
                timestamp: new Date().toLocaleTimeString(),
                accountId: account.id,
                level: 'info',
                message: `[${account.id}] 猫猫今日已完成旅行，跳过`,
              },
              updated,
              { successes, fails, skips }
            );
          }
        }
      }

      // 4. Fetch real growth center tasks from /v2/activity/growth/tasks
      onProgress(
        {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          accountId: account.id,
          level: 'info',
          message: `[${account.id}] 正在拉取官方成长中心任务列表 (/v2/activity/growth/tasks)...`,
        },
        updated,
        { successes, fails, skips }
      );

      const tasksRes = await workbuddyRealApi.getGrowthTasks(creds, authType, extraHeaders);
      if (tasksRes.ok && tasksRes.data) {
        const rawTasksList: WorkBuddyRawTask[] =
          tasksRes.data.data?.tasks || tasksRes.data.tasks || tasksRes.data.data || [];

        if (Array.isArray(rawTasksList) && rawTasksList.length > 0) {
          account.tasks = rawTasksList.map((rt) => mapRawTaskToWorkBuddyTask(rt));

          onProgress(
            {
              id: Math.random().toString(36).substring(2, 9),
              timestamp: new Date().toLocaleTimeString(),
              accountId: account.id,
              level: 'success',
              message: `[${account.id}] 成功同步到 ${rawTasksList.length} 项官方真实任务！`,
            },
            updated,
            { successes, fails, skips }
          );

          // 5. Auto accept any unaccepted tasks (/activity/growth/tasks/accept)
          const unacceptedCodes = rawTasksList
            .filter((t) => t.accept_status === 'not_accepted')
            .map((t) => t.task_code);

          if (unacceptedCodes.length > 0) {
            await workbuddyRealApi.acceptTasks(unacceptedCodes, creds, authType, extraHeaders);
            onProgress(
              {
                id: Math.random().toString(36).substring(2, 9),
                timestamp: new Date().toLocaleTimeString(),
                accountId: account.id,
                level: 'info',
                message: `[${account.id}] 已自动接取 ${unacceptedCodes.length} 项未开始任务`,
              },
              updated,
              { successes, fails, skips }
            );
          }

          // 6. Execute & claim each un-claimed task (prioritize already-completed '待领奖' tasks first!)
          const claimableFirst = account.tasks
            .filter((t) => t.status === '待领奖')
            .map((t) => rawTasksList.find((r) => r.task_code === t.id || r.title === t.name))
            .filter((r): r is WorkBuddyRawTask => Boolean(r));
          const claimableCodes = new Set(claimableFirst.map((r) => r.task_code));
          const otherPending = rawTasksList.filter(
            (t) => t.accept_status !== 'claimed' && !claimableCodes.has(t.task_code)
          );
          const pendingRawTasks = [...claimableFirst, ...otherPending];

          for (const pTask of pendingRawTasks) {
            if (this.isCancelled) break;

            const isPreCompleted = claimableCodes.has(pTask.task_code);
            onProgress(
              {
                id: Math.random().toString(36).substring(2, 9),
                timestamp: new Date().toLocaleTimeString(),
                accountId: account.id,
                level: 'info',
                message: isPreCompleted
                  ? `[${account.id}] 检测到任务【${pTask.title}】已达标，正在直接自动领取奖励...`
                  : `[${account.id}] 正在自动执行任务【${pTask.title}】并尝试领奖...`,
              },
              updated,
              { successes, fails, skips }
            );

            const execResult = await workbuddyRealApi.executeGrowthTask(
              pTask,
              creds,
              authType,
              extraHeaders,
              (level, msg) => {
                onProgress(
                  {
                    id: Math.random().toString(36).substring(2, 9),
                    timestamp: new Date().toLocaleTimeString(),
                    accountId: account.id,
                    level,
                    message: `[${account.id}] [${pTask.title}] ${msg}`,
                  },
                  updated,
                  { successes, fails, skips }
                );
              }
            );

            // Real-time API call to update points after EVERY task
            const pointsBefore = account.points;
            await this.syncLivePointsFromServer(account, creds, authType, extraHeaders);
            const pointsGained = account.points > pointsBefore;

            const idx = account.tasks.findIndex((t) => t.id === pTask.task_code || t.name === pTask.title);
            if (idx !== -1) {
              if (execResult.claimed || pointsGained) {
                successes++;
                account.tasks[idx].status = '已领奖';
                account.tasks[idx].currentProgress = account.tasks[idx].targetProgress;
                account.tasks[idx].recentResult = `已完成并领奖 (+${account.tasks[idx].reward}分)`;
                onProgress(
                  {
                    id: Math.random().toString(36).substring(2, 9),
                    timestamp: new Date().toLocaleTimeString(),
                    accountId: account.id,
                    level: 'success',
                    message: `[${account.id}] 任务【${pTask.title}】完成领奖！已调接口实时刷新积分：${account.points}`,
                  },
                  updated,
                  { successes, fails, skips }
                );
              } else {
                account.tasks[idx].recentResult = execResult.detail;
                onProgress(
                  {
                    id: Math.random().toString(36).substring(2, 9),
                    timestamp: new Date().toLocaleTimeString(),
                    accountId: account.id,
                    level: 'warn',
                    message: `[${account.id}] 任务【${pTask.title}】状态: ${execResult.detail}`,
                  },
                  updated,
                  { successes, fails, skips }
                );
              }
            }
          }

          // Re-fetch official tasks list after batch execution to sync exact server progress
          const refreshedTasksRes = await workbuddyRealApi.getGrowthTasks(creds, authType, extraHeaders);
          if (refreshedTasksRes.ok && refreshedTasksRes.data) {
            const refreshedRaw: WorkBuddyRawTask[] =
              refreshedTasksRes.data.data?.tasks ||
              refreshedTasksRes.data.tasks ||
              refreshedTasksRes.data.data ||
              [];
            if (Array.isArray(refreshedRaw) && refreshedRaw.length > 0) {
              account.tasks = refreshedRaw.map((rt) => mapRawTaskToWorkBuddyTask(rt));
            }
          }
        }
      }

      // 7. Daily check-in / streak + real-time API points sync
      const streakRes = await workbuddyRealApi.getDailyStreak(creds, authType, extraHeaders);
      await this.syncLivePointsFromServer(account, creds, authType, extraHeaders);
      if (streakRes.ok && streakRes.data) {
        const sData = streakRes.data.data || streakRes.data;
        onProgress(
          {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            accountId: account.id,
            level: 'info',
            message: `[${account.id}] 官方签到/活跃状态更新成功 (连续活跃: ${sData.streak?.days || 1} 天 · 实时积分: ${account.points})`,
          },
          updated,
          { successes, fails, skips }
        );
      }

      account.status = account.status === '异常' ? '异常' : '正常';
      account.lastUpdated = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }

    return updated;
  }

  // Quick single cat travel execution with real-time API points refresh
  public async runCatTravelOnly(
    accounts: WorkBuddyAccount[],
    onProgress: (log: ExecutionLog, updatedAccounts: WorkBuddyAccount[]) => void
  ): Promise<WorkBuddyAccount[]> {
    const updated = JSON.parse(JSON.stringify(accounts)) as WorkBuddyAccount[];

    for (const account of updated) {
      const creds = account.credentials || '';
      const authType = account.authType || 'cookie';
      const extraHeaders = account.extraHeaders;

      onProgress(
        {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          accountId: account.id,
          level: 'info',
          message: `[${account.id}] 正在向官方服务端发送猫猫旅行请求...`,
        },
        updated
      );

      const statusRes = await workbuddyRealApi.getCatTravelStatus(creds, authType, extraHeaders);
      if (statusRes.ok) {
        await workbuddyRealApi.claimCatTravelReward(creds, authType, extraHeaders);
        await workbuddyRealApi.departCatTravel(1, creds, authType, extraHeaders);
        await this.syncLivePointsFromServer(account, creds, authType, extraHeaders);

        account.catTravel.status = '今日已完成';
        account.catTravel.statusUpdated = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

        onProgress(
          {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            accountId: account.id,
            level: 'success',
            message: `[${account.id}] 猫猫旅行请求已完成，实时同步积分：${account.points}`,
          },
          updated
        );
      } else {
        onProgress(
          {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            accountId: account.id,
            level: 'warn',
            message: `[${account.id}] 猫猫旅行接口调用完成 (HTTP ${statusRes.status})`,
          },
          updated
        );
      }
    }

    return updated;
  }
}

export const automationEngine = new AutomationEngine();
