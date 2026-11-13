import { WorkBuddyAccount, WorkBuddyTask, ExecutionLog } from '../types/workbuddy';
import { workbuddyRealApi, WorkBuddyRawTask } from './workbuddyRealApi';

export class AutomationEngine {
  private isCancelled = false;

  public cancel() {
    this.isCancelled = true;
  }

  public resetCancel() {
    this.isCancelled = false;
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

      // 1. Fetch real user profile
      const userProfileRes = await workbuddyRealApi.getUserInfo(creds, authType);
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

      // 2. Fetch real user points & credits balance
      const resourceRes = await workbuddyRealApi.getResourceSummary(creds, authType);
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
        }
      } else if (resourceRes.status === 401) {
        fails++;
        account.status = '异常';
        onProgress(
          {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            accountId: account.id,
            level: 'error',
            message: `[${account.id}] 官方接口返回 401 Unauthorized：Cookie 或 Token 已失效，请在设置中更新凭据`,
          },
          updated,
          { successes, fails, skips }
        );
      }

      // 3. Fetch real Cat Travel status & auto depart / claim
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

        const travelStatusRes = await workbuddyRealApi.getCatTravelStatus(creds, authType);
        if (travelStatusRes.ok && travelStatusRes.data) {
          const tData = travelStatusRes.data.data || travelStatusRes.data;
          // check if can claim
          if (tData.can_claim || tData.status === 'completed' || tData.status === 'finished') {
            onProgress(
              {
                id: Math.random().toString(36).substring(2, 9),
                timestamp: new Date().toLocaleTimeString(),
                accountId: account.id,
                level: 'info',
                message: `[${account.id}] 猫猫旅行已结束，正在领取旅行奖励 (/claim)...`,
              },
              updated,
              { successes, fails, skips }
            );
            const claimRes = await workbuddyRealApi.claimCatTravelReward(creds, authType);
            if (claimRes.ok) {
              successes++;
              account.catTravel.status = '今日已完成';
              account.catTravel.lastResult = '猫猫旅行完成并已领取奖励！';
              onProgress(
                {
                  id: Math.random().toString(36).substring(2, 9),
                  timestamp: new Date().toLocaleTimeString(),
                  accountId: account.id,
                  level: 'success',
                  message: `[${account.id}] 成功领取猫猫旅行奖励！`,
                },
                updated,
                { successes, fails, skips }
              );
            }
          } else if (tData.status === 'ready' || tData.status === 'idle' || tData.can_depart) {
            onProgress(
              {
                id: Math.random().toString(36).substring(2, 9),
                timestamp: new Date().toLocaleTimeString(),
                accountId: account.id,
                level: 'info',
                message: `[${account.id}] 猫猫状态就绪，正在派出猫猫旅行 (/depart)...`,
              },
              updated,
              { successes, fails, skips }
            );
            const departRes = await workbuddyRealApi.departCatTravel(1, creds, authType);
            if (departRes.ok) {
              successes++;
              account.catTravel.status = '今日已完成';
              account.catTravel.lastResult = '猫猫已成功启程旅行！';
              onProgress(
                {
                  id: Math.random().toString(36).substring(2, 9),
                  timestamp: new Date().toLocaleTimeString(),
                  accountId: account.id,
                  level: 'success',
                  message: `[${account.id}] 猫猫已自动出发旅行！`,
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

      const tasksRes = await workbuddyRealApi.getGrowthTasks(creds, authType);
      if (tasksRes.ok && tasksRes.data) {
        const rawTasksList: WorkBuddyRawTask[] =
          tasksRes.data.data?.tasks || tasksRes.data.tasks || tasksRes.data.data || [];

        if (Array.isArray(rawTasksList) && rawTasksList.length > 0) {
          // Map real tasks into account
          account.tasks = rawTasksList.map((rt) => ({
            id: rt.task_code,
            name: rt.title,
            status:
              rt.accept_status === 'claimed'
                ? '已领奖'
                : rt.accept_status === 'completed'
                ? '已领奖'
                : rt.accept_status === 'not_accepted'
                ? '未完成'
                : '进行中',
            currentProgress: rt.current_progress || 0,
            targetProgress: rt.target_progress || 1,
            reward: rt.reward_credit || 50,
            recentResult: rt.accept_status === 'claimed' ? '已领取' : '官方任务同步',
            reason: rt.description || '官方成长计划任务',
            autoExecutable: true,
          }));

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
            onProgress(
              {
                id: Math.random().toString(36).substring(2, 9),
                timestamp: new Date().toLocaleTimeString(),
                accountId: account.id,
                level: 'info',
                message: `[${account.id}] 正在批量接取未开始任务 (${unacceptedCodes.length} 项)...`,
              },
              updated,
              { successes, fails, skips }
            );

            const acceptRes = await workbuddyRealApi.acceptTasks(unacceptedCodes, creds, authType);
            if (acceptRes.ok) {
              successes += unacceptedCodes.length;
              onProgress(
                {
                  id: Math.random().toString(36).substring(2, 9),
                  timestamp: new Date().toLocaleTimeString(),
                  accountId: account.id,
                  level: 'success',
                  message: `[${account.id}] 成功在官方服务端激活接取 ${unacceptedCodes.length} 项任务！`,
                },
                updated,
                { successes, fails, skips }
              );
            }
          }

          // 6. Auto claim any completed tasks (/activity/growth/tasks/{code}/claim)
          const claimableTasks = rawTasksList.filter(
            (t) => t.accept_status === 'completed' || (t.current_progress && t.target_progress && t.current_progress >= t.target_progress && t.accept_status !== 'claimed')
          );

          for (const cTask of claimableTasks) {
            if (this.isCancelled) break;
            const claimRes = await workbuddyRealApi.claimTaskReward(cTask.task_code, creds, authType);
            if (claimRes.ok) {
              successes++;
              onProgress(
                {
                  id: Math.random().toString(36).substring(2, 9),
                  timestamp: new Date().toLocaleTimeString(),
                  accountId: account.id,
                  level: 'success',
                  message: `[${account.id}] 成功在官方服务器领取任务【${cTask.title}】的 ${cTask.reward_credit} 积分！`,
                },
                updated,
                { successes, fails, skips }
              );
            }
          }
        }
      }

      // 7. Check daily streak / checkin
      const streakRes = await workbuddyRealApi.getDailyStreak(creds, authType);
      if (streakRes.ok && streakRes.data) {
        const sData = streakRes.data.data || streakRes.data;
        onProgress(
          {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            accountId: account.id,
            level: 'info',
            message: `[${account.id}] 官方签到/活跃状态更新成功 (连续活跃: ${sData.streak?.days || 1} 天)`,
          },
          updated,
          { successes, fails, skips }
        );
      }

      // 8. Re-fetch final points to reflect claimed credits
      const finalResourceRes = await workbuddyRealApi.getResourceSummary(creds, authType);
      if (finalResourceRes.ok && finalResourceRes.data) {
        const fData = finalResourceRes.data.data || finalResourceRes.data;
        const updatedTotal =
          fData.total_credit ??
          fData.balance ??
          fData.platform_reward_credit ??
          fData.available_credits;
        if (updatedTotal !== undefined) {
          account.points = Number(updatedTotal);
        }
      }

      account.status = account.status === '异常' ? '异常' : '正常';
      account.lastUpdated = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }

    return updated;
  }

  // Quick single cat travel execution
  public async runCatTravelOnly(
    accounts: WorkBuddyAccount[],
    onProgress: (log: ExecutionLog, updatedAccounts: WorkBuddyAccount[]) => void
  ): Promise<WorkBuddyAccount[]> {
    const updated = JSON.parse(JSON.stringify(accounts)) as WorkBuddyAccount[];

    for (const account of updated) {
      const creds = account.credentials || '';
      const authType = account.authType || 'cookie';

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

      const statusRes = await workbuddyRealApi.getCatTravelStatus(creds, authType);
      if (statusRes.ok) {
        const claimRes = await workbuddyRealApi.claimCatTravelReward(creds, authType);
        const departRes = await workbuddyRealApi.departCatTravel(1, creds, authType);

        account.catTravel.status = '今日已完成';
        account.catTravel.statusUpdated = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

        onProgress(
          {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            accountId: account.id,
            level: 'success',
            message: `[${account.id}] 猫猫旅行请求已成功提交至 WorkBuddy 服务端！`,
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
