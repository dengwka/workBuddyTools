import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Copy,
  Check,
  ExternalLink,
  Gift,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
} from 'lucide-react';
import { WorkBuddyTask } from '../types/workbuddy';
import { triggerExternalDownload } from './VersionUpdateModal';

export interface TaskActionRecipe {
  category: 'expert_chat' | 'expert_team' | 'template' | 'automation' | 'client_action' | 'wechat_24h';
  expertKeyword?: string;
  samplePrompt?: string;
  targetUrl: string;
  desktopProtocolUrl?: string;
  steps: string[];
  autoNote: string;
}

export function getTaskRecipe(task: WorkBuddyTask): TaskActionRecipe {
  const title = task.name || '';

  // 1. Specific Expert Chat Tasks
  const expertMatch = title.match(/体验「([^」]+)」/);
  if (expertMatch && !title.includes('发现应用')) {
    const expertName = expertMatch[1];
    return {
      category: 'expert_chat',
      expertKeyword: expertName,
      samplePrompt: `你好，我是通过成长中心前来体验「${expertName}」的，请简单介绍一下你的核心能力并给我一个示例方案。`,
      targetUrl: 'https://www.workbuddy.cn/experts',
      desktopProtocolUrl: 'workbuddy://',
      steps: [
        `点击下方「一键复制专家名」，复制「${expertName}」`,
        `前往 WorkBuddy「专家」页搜索「${expertName}」并点击召唤`,
        `发送任意一句话（可一键复制下方示例提问），完成后点击下方「立即领奖并刷新积分」`,
      ],
      autoNote: '提示：完成 5 个不同专家体验任务，可同步自动完成「召唤 5 次专家 (100分)」任务！',
    };
  }

  // 2. Summon 5 Experts
  if (title.includes('召唤 5 次专家')) {
    return {
      category: 'expert_chat',
      expertKeyword: '无畏契约拼豆专家 / 中国电商运营专家 / 抖音策略师 / 商家宣传页与海报设计师 / 直播电商教练',
      samplePrompt: '你好，请给我一个快速入门建议。',
      targetUrl: 'https://www.workbuddy.cn/experts',
      desktopProtocolUrl: 'workbuddy://',
      steps: [
        '优先完成列表中那 5 个专项「体验 XXX 专家」任务，本任务进度会自动同步增加至 5/5',
        '每召唤 1 位不同的专家发送 1 句话，进度即 +1',
        '达到 5/5 后点击下方「立即领奖并刷新积分」领取 100 积分',
      ],
      autoNote: '联动任务：做完上面 5 个专项专家任务即可直接满进度领奖。',
    };
  }

  // 3. Summon 3 Expert Teams
  if (title.includes('专家团')) {
    return {
      category: 'expert_team',
      expertKeyword: '专家团',
      samplePrompt: '请帮我制定一份今日重点工作执行计划。',
      targetUrl: 'https://www.workbuddy.cn/experts?tab=team',
      desktopProtocolUrl: 'workbuddy://',
      steps: [
        '打开 WorkBuddy 切换至「专家团」标签页',
        '任选 3 个不同的专家团队点击召唤并各发送 1 条简短指令',
        '完成后点击下方「立即领奖并刷新积分」领取 100 积分',
      ],
      autoNote: '支持自动触发上报；若服务端校验实时流会话，按上述步骤 30 秒即可完成。',
    };
  }

  // 4. Use 5 Templates
  if (title.includes('模板')) {
    return {
      category: 'template',
      samplePrompt: '请按模板默认参数生成一份简要示例。',
      targetUrl: 'https://www.workbuddy.cn/',
      desktopProtocolUrl: 'workbuddy://',
      steps: [
        '在 WorkBuddy 点击「新建任务」，在模板区任选 5 个不同的模板',
        '点击套用模板并发起一次对话',
        '满 5 次后点击下方「立即领奖并刷新积分」领取 100 积分',
      ],
      autoNote: '模板达人任务：套用 5 个不同模板发起对话即可解锁 100 Credits + 5 能量。',
    };
  }

  // 5. Set Automation Task
  if (title.includes('自动化任务')) {
    return {
      category: 'automation',
      samplePrompt: '每日早上 9:00 自动汇总今日待办事项',
      targetUrl: 'https://www.workbuddy.cn/',
      desktopProtocolUrl: 'workbuddy://',
      steps: [
        '在 WorkBuddy 左侧导航进入「自动化」或「定时任务」模块',
        '新建 1 个任意自动化规则并保存生效',
        '点击下方「立即领奖并刷新积分」领取 100 积分',
      ],
      autoNote: '自动高手任务：只需创建 1 条自动化规则即可完成（领奖后可随时关闭该规则）。',
    };
  }

  // 6. Explore Inspiration (PC)
  if (title.includes('探索优秀灵感')) {
    return {
      category: 'client_action',
      targetUrl: 'https://www.workbuddy.cn/',
      desktopProtocolUrl: 'workbuddy://',
      steps: [
        '前往 WorkBuddy 首页或「灵感」专区',
        '点击任意 1 款「灵感」优秀案例进入体验/查看',
        '点击下方「自动触发完成并领奖」即可领取 100 积分',
      ],
      autoNote: 'PC 端任务：工具会自动携带 PC 端标识尝试上报完成。',
    };
  }

  // 7. Discover App (5.5.3+)
  if (title.includes('发现应用')) {
    return {
      category: 'client_action',
      targetUrl: 'https://www.workbuddy.cn/',
      desktopProtocolUrl: 'workbuddy://',
      steps: [
        '工具已自动伪装 WorkBuddy/5.9.0 桌面端请求头尝试触发应用打开埋点',
        '若需客户端进程确认：打开 WorkBuddy 电脑端点击左上角「发现应用」进入任意 Buddy 应用',
        '点击下方「立即领奖并刷新积分」领取 100 积分',
      ],
      autoNote: '要求电脑端 5.5.3 或以上版本，点击左上角「发现应用」进入任意应用即可。',
    };
  }

  // 8. Share Skill (5.9.0+)
  if (title.includes('分享一个技能')) {
    return {
      category: 'client_action',
      targetUrl: 'https://www.workbuddy.cn/',
      desktopProtocolUrl: 'workbuddy://',
      steps: [
        '工具已自动伪装 WorkBuddy/5.9.0 请求头调用技能分享接口',
        '您也可以在电脑端前往「技能」列表 -> 点击任意技能 -> 点击右上角「分享」按钮生成分享链接（无需真发给好友）',
        '点击下方「立即领奖并刷新积分」领取 100 积分',
      ],
      autoNote: '小技巧：点击「分享」按钮生成链接的瞬间服务端即判定完成，无需真正发送给好友！',
    };
  }

  // 9. Follow Official WeChat Account (24h)
  if (title.includes('公众号')) {
    return {
      category: 'wechat_24h',
      expertKeyword: '腾讯 WorkBuddy',
      targetUrl: 'https://www.workbuddy.cn/profile/growth-center',
      steps: [
        '打开手机微信搜索并关注「腾讯 WorkBuddy」官方公众号',
        '在公众号菜单或成长中心完成账号绑定，保持关注满 24 小时',
        '满 24 小时后，点击下方「立即领奖并刷新积分」或使用「一键执行全部日常」自动领奖',
      ],
      autoNote: '该任务由微信开放平台校验关注时长（需满 24 小时），满 24 小时后工具可自动为您领取 100 积分。',
    };
  }

  return {
    category: 'client_action',
    targetUrl: 'https://www.workbuddy.cn/profile/growth-center',
    desktopProtocolUrl: 'workbuddy://',
    steps: [
      `查看任务要求：${task.reason || task.name}`,
      '点击下方「自动触发完成并领奖」尝试服务端直接完成与领奖',
    ],
    autoNote: '执行完成后将立即调用官方资源接口同步最新实时积分。',
  };
}

interface TaskAssistModalProps {
  isOpen: boolean;
  task: WorkBuddyTask | null;
  onClose: () => void;
  onExecuteAndClaim: (task: WorkBuddyTask) => Promise<{ ok: boolean; message: string; points?: number }>;
}

export const TaskAssistModal: React.FC<TaskAssistModalProps> = ({
  isOpen,
  task,
  onClose,
  onExecuteAndClaim,
}) => {
  const [copiedKeyword, setCopiedKeyword] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [resultFeedback, setResultFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  if (!isOpen || !task) return null;

  const recipe = getTaskRecipe(task);

  const handleCopy = (text: string, type: 'keyword' | 'prompt') => {
    navigator.clipboard.writeText(text);
    if (type === 'keyword') {
      setCopiedKeyword(true);
      setTimeout(() => setCopiedKeyword(false), 2000);
    } else {
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    }
  };

  const handleRunExecute = async () => {
    setIsExecuting(true);
    setResultFeedback(null);
    try {
      const res = await onExecuteAndClaim(task);
      setResultFeedback({
        ok: res.ok,
        message: res.message,
      });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/90">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-100 text-sm">{task.name}</h3>
                <span className="px-2 py-0.5 text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">
                  +{task.reward} 积分
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                当前进度: {task.currentProgress}/{task.targetProgress} · 状态: {task.status}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs">
          {/* Official Requirement */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
            <div className="text-[11px] text-slate-400 font-medium">官方完成条件：</div>
            <div className="text-slate-200 leading-relaxed">{task.reason}</div>
          </div>

          {/* Quick Copy Helpers for Expert / Prompt */}
          {(recipe.expertKeyword || recipe.samplePrompt) && (
            <div className="space-y-2">
              {recipe.expertKeyword && (
                <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between gap-2">
                  <div className="truncate">
                    <span className="text-slate-400">目标名称：</span>
                    <span className="text-emerald-400 font-mono font-semibold">{recipe.expertKeyword}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(recipe.expertKeyword!, 'keyword')}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                  >
                    {copiedKeyword ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKeyword ? '已复制名称' : '一键复制名称'}</span>
                  </button>
                </div>
              )}

              {recipe.samplePrompt && (
                <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between gap-2">
                  <div className="truncate">
                    <span className="text-slate-400">推荐对话词：</span>
                    <span className="text-slate-300 font-mono">{recipe.samplePrompt}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(recipe.samplePrompt!, 'prompt')}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                  >
                    {copiedPrompt ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <MessageSquare className="w-3.5 h-3.5" />}
                    <span>{copiedPrompt ? '已复制提问' : '一键复制提问'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step-by-step Execution Guide */}
          <div className="space-y-2">
            <div className="text-slate-300 font-medium">快速完成方案：</div>
            <div className="space-y-1.5">
              {recipe.steps.map((step, i) => (
                <div key={i} className="flex items-start gap-2 text-slate-300 leading-relaxed">
                  <span className="w-4 h-4 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-[10px] font-mono shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
            <div className="p-2.5 bg-indigo-950/25 border border-indigo-500/30 rounded-xl text-[11px] text-indigo-300">
              💡 {recipe.autoNote}
            </div>
          </div>

          {/* Feedback Banner */}
          {resultFeedback && (
            <div
              className={`p-3 rounded-xl border flex items-start gap-2 ${
                resultFeedback.ok
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              }`}
            >
              {resultFeedback.ok ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed font-mono text-[11px]">{resultFeedback.message}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-1 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => triggerExternalDownload(recipe.targetUrl)}
              className="flex-1 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
              <span>打开官方任务页去完成</span>
            </button>

            <button
              type="button"
              onClick={handleRunExecute}
              disabled={isExecuting}
              className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl shadow-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isExecuting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : task.status === '已领奖' ? (
                <Gift className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>{isExecuting ? '正在执行并同步积分...' : '自动触发完成 / 立即领奖'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
