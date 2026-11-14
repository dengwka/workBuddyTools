import { WorkBuddyAccount, ExecutionLog } from '../types/workbuddy';
import {
  workbuddyRealApi,
  WorkBuddyRawTask,
  mapRawTaskToWorkBuddyTask,
  roundPoints,
  formatAccountLabel,
  getLocalDateKey,
  formatFullDateTime,
} from './workbuddyRealApi';

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
        account.points = roundPoints(totalPoints);
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
      const acc = updated[accIdx];
      const accPrefix = `[操作账号: ${formatAccountLabel(acc.id, acc.nickname)}]`;
      if (this.isCancelled) {
        onProgress(
          {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            accountId: acc.id,
            level: 'warn',
            message: `${accPrefix} 用户中断了任务批处理执行`,
          },
          updated,
          { successes, fails, skips }
        );
        break;
      }

      const account = acc;
      account.status = '运行中';
      const getAccPrefix = () => `[操作账号: ${formatAccountLabel(account.id, account.nickname)}]`;

      onProgress(
        {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          accountId: account.id,
          level: 'info',
          message: `${getAccPrefix()} 正在向 https://www.workbuddy.cn 发起真实接口鉴权...`,
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
              message: `${getAccPrefix()} 官方账号认证成功，当前用户：${account.nickname}`,
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
            message: `${getAccPrefix()} 成功同步 WorkBuddy 官方实时积分：${account.points} 积分`,
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
              message: `${getAccPrefix()} 官方接口返回 401 Unauthorized：Cookie 或 Token 已失效，请双击账号更新凭据`,
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
            message: `${getAccPrefix()} 正在查询猫猫旅行官方状态 (/activity/growth/buddy/travel/status)...`,
          },
          updated,
          { successes, fails, skips }
        );

        const travelStatusRes = await workbuddyRealApi.getCatTravelStatus(creds, authType, extraHeaders);
        if (travelStatusRes.ok && travelStatusRes.data) {
          const tData = travelStatusRes.data.data || travelStatusRes.data;
          const nowDate = new Date();
          const todayKey = getLocalDateKey(nowDate);
          const nowFull = formatFullDateTime(nowDate);
          const nowTime = nowDate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

          if (tData.can_claim || tData.status === 'completed' || tData.status === 'finished') {
            const claimRes = await workbuddyRealApi.claimCatTravelReward(creds, authType, extraHeaders);
            if (claimRes.ok) {
              successes++;
              account.catTravel.status = '今日已完成';
              account.catTravel.statusUpdated = nowTime;
              account.catTravel.lastCompletedAt = nowFull;
              account.catTravel.lastCompletedDate = todayKey;
              account.catTravel.remainingSeconds = 0;
              account.catTravel.detailMessage = `猫猫今日旅行完成并已领奖 (完成时间: ${nowFull})`;
              account.catTravel.lastResult = `猫猫旅行完成并已领取奖励 (${nowFull})`;
              await new Promise((r) => setTimeout(r, 400));
              await this.syncLivePointsFromServer(account, creds, authType, extraHeaders);
              onProgress(
                {
                  id: Math.random().toString(36).substring(2, 9),
                  timestamp: new Date().toLocaleTimeString(),
                  accountId: account.id,
                  level: 'success',
                  message: `${getAccPrefix()} 成功领取猫猫旅行奖励 (完成时间: ${nowFull})，已调官方服务实时刷新积分：${account.points}`,
                },
                updated,
                { successes, fails, skips }
              );
            }
          } else if (tData.status === 'ready' || tData.status === 'idle' || tData.can_depart) {
            const departRes = await workbuddyRealApi.departCatTravel(1, creds, authType, extraHeaders);
            if (departRes.ok) {
              successes++;
              await new Promise((r) => setTimeout(r, 400));
              const afterRes = await workbuddyRealApi.getCatTravelStatus(creds, authType, extraHeaders).catch(() => null);
              const afterData = afterRes?.ok ? afterRes.data?.data || afterRes.data || {} : {};
              const afterNow = new Date();
              const afterKey = getLocalDateKey(afterNow);
              const afterFull = formatFullDateTime(afterNow);
              const afterTime = afterNow.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

              if (afterData.can_claim || afterData.status === 'completed' || afterData.status === 'finished') {
                await workbuddyRealApi.claimCatTravelReward(creds, authType, extraHeaders).catch(() => null);
                account.catTravel.status = '今日已完成';
                account.catTravel.statusUpdated = afterTime;
                account.catTravel.lastCompletedAt = afterFull;
                account.catTravel.lastCompletedDate = afterKey;
                account.catTravel.remainingSeconds = 0;
                account.catTravel.detailMessage = `猫猫今日旅行完成并已领奖 (完成时间: ${afterFull})`;
                account.catTravel.lastResult = `猫猫已出发并领取今日奖励 (${afterFull})`;
              } else if (afterData.status === 'in_travel' && Number(afterData.remaining_seconds || 0) > 0) {
                account.catTravel.status = '旅行中';
                account.catTravel.statusUpdated = afterTime;
                account.catTravel.lastDepartedAt = afterFull;
                account.catTravel.remainingSeconds = Number(afterData.remaining_seconds || 0);
                account.catTravel.detailMessage = `猫猫已出发旅行 (剩余 ${account.catTravel.remainingSeconds}s)，归来后自动托管领奖`;
                account.catTravel.lastResult = `猫猫旅行中 (${afterFull} 出发)`;
              } else {
                account.catTravel.status = '今日已完成';
                account.catTravel.statusUpdated = afterTime;
                account.catTravel.lastCompletedAt = afterFull;
                account.catTravel.lastCompletedDate = afterKey;
                account.catTravel.detailMessage = `猫猫今日已启程完成旅行 (记录时间: ${afterFull})`;
                account.catTravel.lastResult = `猫猫已成功启程旅行 (${afterFull})`;
              }
              await this.syncLivePointsFromServer(account, creds, authType, extraHeaders);
              onProgress(
                {
                  id: Math.random().toString(36).substring(2, 9),
                  timestamp: new Date().toLocaleTimeString(),
                  accountId: account.id,
                  level: 'success',
                  message: `${getAccPrefix()} 猫猫已自动出发旅行 (时间: ${afterFull})，当前官方实时积分：${account.points}`,
                },
                updated,
                { successes, fails, skips }
              );
            }
          } else if (tData.status === 'in_travel') {
            const remSec = Number(tData.remaining_seconds || 0);
            account.catTravel.status = '旅行中';
            account.catTravel.statusUpdated = nowTime;
            account.catTravel.remainingSeconds = remSec;
            account.catTravel.detailMessage = `猫猫正在旅行中${remSec > 0 ? ` (约 ${remSec} 秒后归来自动领奖)` : ''}`;
            account.catTravel.lastResult = '猫猫旅行进行中';
            onProgress(
              {
                id: Math.random().toString(36).substring(2, 9),
                timestamp: new Date().toLocaleTimeString(),
                accountId: account.id,
                level: 'info',
                message: `${getAccPrefix()} 猫猫当前正在旅行中${remSec > 0 ? ` (剩余 ${remSec}s)` : ''}，归来后将自动领奖`,
              },
              updated,
              { successes, fails, skips }
            );
          } else if (tData.daily_limit_reached || tData.status === 'daily_limit_reached') {
            skips++;
            const rememberedAt =
              account.catTravel.lastCompletedDate === todayKey && account.catTravel.lastCompletedAt
                ? account.catTravel.lastCompletedAt
                : nowFull;
            account.catTravel.status = '今日已完成';
            account.catTravel.statusUpdated = nowTime;
            account.catTravel.lastCompletedAt = rememberedAt;
            account.catTravel.lastCompletedDate = todayKey;
            account.catTravel.remainingSeconds = 0;
            account.catTravel.detailMessage = `猫猫今日已完成旅行 (完成时间: ${rememberedAt})`;
            account.catTravel.lastResult = '猫猫今日旅行次数已达上限，无需重复执行';
            onProgress(
              {
                id: Math.random().toString(36).substring(2, 9),
                timestamp: new Date().toLocaleTimeString(),
                accountId: account.id,
                level: 'info',
                message: `${getAccPrefix()} 猫猫今日已完成旅行 (记录时间: ${rememberedAt})，跳过`,
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
          message: `${getAccPrefix()} 正在拉取官方成长中心任务列表 (/v2/activity/growth/tasks)...`,
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
              message: `${getAccPrefix()} 成功同步到 ${rawTasksList.length} 项官方真实任务！`,
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
                message: `${getAccPrefix()} 已自动接取 ${unacceptedCodes.length} 项未开始任务`,
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
                  ? `${getAccPrefix()} 检测到任务【${pTask.title}】已达标，正在直接自动领取奖励...`
                  : `${getAccPrefix()} 正在自动执行任务【${pTask.title}】并尝试领奖...`,
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
                    message: `${getAccPrefix()} [${pTask.title}] ${msg}`,
                  },
                  updated,
                  { successes, fails, skips }
                );
              }
            );

            // Real-time API call to update points after EVERY task (brief wait if claimed so server credit ledger settles)
            const pointsBefore = account.points;
            if (execResult.claimed) {
              await new Promise((r) => setTimeout(r, 450));
            }
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
                    message: `${getAccPrefix()} 任务【${pTask.title}】完成领奖！已调接口实时刷新积分：${account.points}`,
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
                    message: `${getAccPrefix()} 任务【${pTask.title}】状态: ${execResult.detail}`,
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
        const streakDays = Number(sData?.streak?.days || 1);
        const nowCheck = new Date();
        account.dailyCheckin = {
          lastCheckinDate: getLocalDateKey(nowCheck),
          lastCheckinAt: formatFullDateTime(nowCheck),
          streakDays,
        };
        onProgress(
          {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            accountId: account.id,
            level: 'info',
            message: `${getAccPrefix()} 官方签到/活跃状态更新成功 (连续活跃: ${streakDays} 天 · 实时积分: ${account.points})`,
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
      const accPrefix = `[操作账号: ${formatAccountLabel(account.id, account.nickname)}]`;

      onProgress(
        {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          accountId: account.id,
          level: 'info',
          message: `${accPrefix} 正在向官方服务端发送猫猫旅行请求...`,
        },
        updated
      );

      const statusRes = await workbuddyRealApi.getCatTravelStatus(creds, authType, extraHeaders);
      if (statusRes.ok) {
        const tData = statusRes.data?.data || statusRes.data || {};
        const now = new Date();
        const todayKey = getLocalDateKey(now);
        const nowFull = formatFullDateTime(now);
        const nowTime = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

        if (tData.daily_limit_reached || tData.status === 'daily_limit_reached') {
          const rememberedAt =
            account.catTravel.lastCompletedDate === todayKey && account.catTravel.lastCompletedAt
              ? account.catTravel.lastCompletedAt
              : nowFull;
          account.catTravel.status = '今日已完成';
          account.catTravel.statusUpdated = nowTime;
          account.catTravel.lastCompletedAt = rememberedAt;
          account.catTravel.lastCompletedDate = todayKey;
          account.catTravel.remainingSeconds = 0;
          account.catTravel.detailMessage = `猫猫今日已完成旅行 (完成时间: ${rememberedAt})`;
          account.catTravel.lastResult = `今日已完成 (${rememberedAt})`;
        } else {
          if (tData.can_claim || tData.status === 'completed' || tData.status === 'finished') {
            await workbuddyRealApi.claimCatTravelReward(creds, authType, extraHeaders);
          } else if (tData.status !== 'in_travel') {
            await workbuddyRealApi.departCatTravel(1, creds, authType, extraHeaders);
            await new Promise((r) => setTimeout(r, 400));
            await workbuddyRealApi.claimCatTravelReward(creds, authType, extraHeaders).catch(() => null);
          }

          await new Promise((r) => setTimeout(r, 350));
          const verifyRes = await workbuddyRealApi.getCatTravelStatus(creds, authType, extraHeaders).catch(() => null);
          const vData = verifyRes?.ok ? verifyRes.data?.data || verifyRes.data || {} : {};
          const finishNow = new Date();
          const finishKey = getLocalDateKey(finishNow);
          const finishFull = formatFullDateTime(finishNow);
          const finishTime = finishNow.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

          if (vData.status === 'in_travel' && Number(vData.remaining_seconds || 0) > 0 && !vData.can_claim) {
            account.catTravel.status = '旅行中';
            account.catTravel.statusUpdated = finishTime;
            account.catTravel.lastDepartedAt = finishFull;
            account.catTravel.remainingSeconds = Number(vData.remaining_seconds || 0);
            account.catTravel.detailMessage = `猫猫正在旅行中 (剩余 ${account.catTravel.remainingSeconds}s)，归来后自动领奖`;
            account.catTravel.lastResult = `旅行中 (${finishFull} 出发)`;
          } else {
            account.catTravel.status = '今日已完成';
            account.catTravel.statusUpdated = finishTime;
            account.catTravel.lastCompletedAt = finishFull;
            account.catTravel.lastCompletedDate = finishKey;
            account.catTravel.remainingSeconds = 0;
            account.catTravel.detailMessage = `猫猫今日已完成旅行 (完成时间: ${finishFull})`;
            account.catTravel.lastResult = `已完成并记录时间 (${finishFull})`;
          }
        }

        await this.syncLivePointsFromServer(account, creds, authType, extraHeaders);

        onProgress(
          {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            accountId: account.id,
            level: 'success',
            message: `${accPrefix} 猫猫旅行处理完成 (${account.catTravel.status}${
              account.catTravel.lastCompletedAt ? ` · 完成时间 ${account.catTravel.lastCompletedAt}` : ''
            })，实时同步积分：${account.points}`,
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
            message: `${accPrefix} 猫猫旅行接口调用完成 (HTTP ${statusRes.status})`,
          },
          updated
        );
      }
    }

    return updated;
  }
}

export const automationEngine = new AutomationEngine();
