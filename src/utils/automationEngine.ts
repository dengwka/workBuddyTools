import { WorkBuddyAccount, WorkBuddyTask, ExecutionLog } from '../types/workbuddy';

export class AutomationEngine {
  private isCancelled = false;

  public cancel() {
    this.isCancelled = true;
  }

  public resetCancel() {
    this.isCancelled = false;
  }

  // Simulate or execute all daily tasks
  public async runDailyTasks(
    accounts: WorkBuddyAccount[],
    onProgress: (log: ExecutionLog, updatedAccounts: WorkBuddyAccount[], statsDelta: { successes: number; fails: number; skips: number }) => void
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
          message: `[${account.id}] 开始执行账号日常任务（当前积分：${account.points}）`,
        },
        updated,
        { successes, fails, skips }
      );

      // 1. Cat travel check
      if (account.catTravel.autoTravel) {
        if (account.catTravel.status === '待出发') {
          account.catTravel.status = '今日已完成';
          account.catTravel.detailMessage = '猫猫今日已完成旅行 (服务端标记 daily_limit_reached)';
          account.catTravel.lastResult = '猫猫旅行完成，获得 50 积分';
          account.points += 50;
          successes++;
          onProgress(
            {
              id: Math.random().toString(36).substring(2, 9),
              timestamp: new Date().toLocaleTimeString(),
              accountId: account.id,
              level: 'success',
              message: `[${account.id}] 猫猫旅行出发并顺利归来，奖励 +50 积分！`,
            },
            updated,
            { successes, fails, skips }
          );
        } else {
          skips++;
          onProgress(
            {
              id: Math.random().toString(36).substring(2, 9),
              timestamp: new Date().toLocaleTimeString(),
              accountId: account.id,
              level: 'info',
              message: `[${account.id}] 猫猫今日已完成旅行，跳过旅行任务`,
            },
            updated,
            { successes, fails, skips }
          );
        }
      }

      // 2. Iterate each task
      for (let tIdx = 0; tIdx < account.tasks.length; tIdx++) {
        if (this.isCancelled) break;
        const task = account.tasks[tIdx];

        if (task.status === '已领奖') {
          // Already done
          continue;
        }

        if (!task.autoExecutable || task.status === '需人工') {
          skips++;
          task.recentResult = '需真人扫码，工具自动跳过';
          onProgress(
            {
              id: Math.random().toString(36).substring(2, 9),
              timestamp: new Date().toLocaleTimeString(),
              accountId: account.id,
              level: 'warn',
              message: `[${account.id}] 任务【${task.name}】需人工操作，已跳过`,
            },
            updated,
            { successes, fails, skips }
          );
          continue;
        }

        if (task.status === '需等待') {
          skips++;
          task.recentResult = '等待活动窗口开启';
          onProgress(
            {
              id: Math.random().toString(36).substring(2, 9),
              timestamp: new Date().toLocaleTimeString(),
              accountId: account.id,
              level: 'info',
              message: `[${account.id}] 任务【${task.name}】非开放时段，跳过`,
            },
            updated,
            { successes, fails, skips }
          );
          continue;
        }

        // Execute task with realistic delay
        await new Promise((r) => setTimeout(r, 400));
        task.currentProgress = task.targetProgress;
        task.status = '已领奖';
        task.recentResult = `自动完成并领取 ${task.reward} 积分`;
        account.points += task.reward;
        successes++;

        onProgress(
          {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            accountId: account.id,
            level: 'success',
            message: `[${account.id}] 成功完成【${task.name}】，奖励 +${task.reward} 积分！`,
          },
          updated,
          { successes, fails, skips }
        );
      }

      account.status = '正常';
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
      if (account.catTravel.status === '待出发') {
        account.catTravel.status = '今日已完成';
        account.catTravel.statusUpdated = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        account.catTravel.detailMessage = '猫猫今日已完成旅行 (服务端标记 daily_limit_reached)';
        account.catTravel.lastResult = '猫猫旅行: 顺利归来，获得 50 积分';
        account.points += 50;

        onProgress(
          {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            accountId: account.id,
            level: 'success',
            message: `[${account.id}] 猫猫旅行顺利完成！获得 50 积分`,
          },
          updated
        );
      } else {
        onProgress(
          {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            accountId: account.id,
            level: 'info',
            message: `[${account.id}] 猫猫旅行: 无需重复执行 (猫猫今日已完成旅行)`,
          },
          updated
        );
      }
    }

    return updated;
  }
}

export const automationEngine = new AutomationEngine();
