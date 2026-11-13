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
  QrCode,
} from 'lucide-react';
import { WorkBuddyTask } from '../types/workbuddy';
import { sanitizeTaskProgress } from '../utils/workbuddyRealApi';
import { triggerExternalDownload } from './VersionUpdateModal';

export interface TaskActionRecipe {
  category: 'expert_chat' | 'expert_team' | 'template' | 'automation' | 'client_action' | 'wechat_24h';
  expertKeyword?: string;
  samplePrompt?: string;
  targetUrl: string;
  growthCenterUrl: string;
  steps: string[];
  autoNote: string;
}

export function getTaskRecipe(task: WorkBuddyTask): TaskActionRecipe {
  const title = task.name || '';
  const growthCenterUrl = 'https://www.workbuddy.cn/profile/growth-center';
  const webWorkspaceUrl = 'https://www.workbuddy.cn/app';

  // 1. Follow Official WeChat Account (24h) - Display Official QR Code Directly!
  if (title.includes('公众号')) {
    return {
      category: 'wechat_24h',
      expertKeyword: '腾讯 WorkBuddy',
      targetUrl: 'https://www.workbuddy.cn/docs/workbuddy/Contact#%E5%AE%98%E6%96%B9%E5%85%AC%E4%BC%97%E5%8F%B7',
      growthCenterUrl,
      steps: [
        '直接用手机微信扫描上方「腾讯 WorkBuddy」官方公众号二维码并点击关注',
        '保持关注满 24 小时（切勿取关）',
        '满 24 小时后，点击下方「同步关注状态并立即领奖」即可直接到账 100 积分',
      ],
      autoNote: '提示：点击下方按钮会自动调用 /v2/activity/growth/subscribe-task/status 同步微信关注时长并领奖。',
    };
  }

  // 2. Specific Expert Chat Tasks
  const expertMatch = title.match(/体验「([^」]+)」/);
  if (expertMatch && !title.includes('发现应用')) {
    const expertName = expertMatch[1];
    return {
      category: 'expert_chat',
      expertKeyword: expertName,
      samplePrompt: `你好，我是通过成长中心前来体验「${expertName}」的，请简单介绍一下你的核心能力并给我一个示例方案。`,
      targetUrl: webWorkspaceUrl,
      growthCenterUrl,
      steps: [
        `点击下方「立即自动完成并领奖」，工具将自动匹配「${expertName}」专家 ID、创建云端对话并上报 /v2/report 埋点`,
        `若需在网页工作台查看：可点击「打开网页工作台 (/app)」在专家页召唤「${expertName}」`,
      ],
      autoNote: '提示：完成 5 个不同专家体验任务，可同步自动完成「召唤 5 次专家 (100分)」任务！',
    };
  }

  // 3. Summon 5 Experts
  if (title.includes('召唤 5 次专家')) {
    return {
      category: 'expert_chat',
      expertKeyword: '无畏契约拼豆专家 / 中国电商运营专家 / 抖音策略师 / 商家宣传页与海报设计师 / 直播电商教练',
      samplePrompt: '你好，请给我一个快速入门建议。',
      targetUrl: webWorkspaceUrl,
      growthCenterUrl,
      steps: [
        '点击下方「立即自动完成并领奖」，工具将自动循环召唤 5 位不同官方专家并上报对话完成事件',
        '完成后自动调用领奖接口并同步最新实时积分',
      ],
      autoNote: '联动任务：自动执行会一次性召唤 5 位不同专家并完成会话上报。',
    };
  }

  // 4. Summon 3 Expert Teams
  if (title.includes('专家团')) {
    return {
      category: 'expert_team',
      expertKeyword: '专家团',
      samplePrompt: '请帮我制定一份今日重点工作执行计划。',
      targetUrl: webWorkspaceUrl,
      growthCenterUrl,
      steps: [
        '点击下方「立即自动完成并领奖」，工具将自动模拟召唤 3 组不同专家团队 (expertType: team) 并上报会话埋点',
        '完成后自动尝试领取 100 积分并刷新实时积分余额',
      ],
      autoNote: '已对接官方 /console/as/conversations/ 与 /v2/report (expert_actual_use) 真实协议。',
    };
  }

  // 5. Use 5 Templates
  if (title.includes('模板')) {
    return {
      category: 'template',
      samplePrompt: '请按模板默认参数生成一份简要示例。',
      targetUrl: webWorkspaceUrl,
      growthCenterUrl,
      steps: [
        '点击下方「立即自动完成并领奖」，工具将自动拉取官方模板列表 (/v2/user/cloudagent/agents/templates)',
        '自动循环使用 5 个不同模板创建任务并上报 agent_task_created_with_template 埋点后自动清理临时会话',
      ],
      autoNote: '模板达人任务：已对接官方模板任务创建与 /v2/report 埋点协议。',
    };
  }

  // 6. Set Automation Task
  if (title.includes('自动化任务')) {
    return {
      category: 'automation',
      samplePrompt: '每日早上 9:00 自动汇总今日待办事项',
      targetUrl: webWorkspaceUrl,
      growthCenterUrl,
      steps: [
        '点击下方「立即自动完成并领奖」，工具将自动调用 /v2/as/scheduler/tasks 创建 1 条自动化定时任务',
        '上报 automated_task_create_suc 埋点并领奖后，自动清理临时定时任务',
      ],
      autoNote: '自动高手任务：全程通过官方定时任务 API 自动创建与领奖。',
    };
  }

  // 7. Explore Inspiration (PC)
  if (title.includes('探索优秀灵感')) {
    return {
      category: 'client_action',
      targetUrl: webWorkspaceUrl,
      growthCenterUrl,
      steps: [
        '点击下方「立即自动完成并领奖」，工具将拉取首页灵感案例 (/api/v1/artifact-recommend/v1/home/queries)',
        '自动携带 WorkBuddy/5.9.0 桌面端标识上报 playbook_cta_click 与 playbook_prompt_send 埋点并领奖',
      ],
      autoNote: 'PC 端任务：已内置 WorkBuddy/5.9.0 桌面端协议与 /v2/report 灵感埋点。',
    };
  }

  // 8. Discover App (5.5.3+)
  if (title.includes('发现应用')) {
    return {
      category: 'client_action',
      targetUrl: webWorkspaceUrl,
      growthCenterUrl,
      steps: [
        '点击下方「立即自动完成并领奖」，工具将自动查询官方 Buddy 应用列表并请求应用详情',
        '自动调用 /api/v2/open-platform/asset-usage/report 与 buddyapp_enter_click 埋点完成任务',
      ],
      autoNote: '已内置电脑端 5.9.0 版本号与 Buddy 应用使用上报接口。',
    };
  }

  // 9. Share Skill (5.9.0+)
  if (title.includes('分享') && title.includes('技能')) {
    return {
      category: 'client_action',
      targetUrl: webWorkspaceUrl,
      growthCenterUrl,
      steps: [
        '点击下方「立即自动完成并领奖」，工具将自动获取官方技能列表 (/api/v2/open-platform/skills)',
        '调用官方分享通道接口 (/api/v2/open-platform/asset-shares/c2c/channels) 生成分享链接并上报成功埋点',
      ],
      autoNote: '无需真正发给好友，直接调用官方 C2C 技能分享接口即可触发完成！',
    };
  }

  // 10. Hot Skill Install & Use
  if (title.includes('技能') || title.includes('尝鲜')) {
    return {
      category: 'client_action',
      targetUrl: webWorkspaceUrl,
      growthCenterUrl,
      steps: [
        '点击下方「立即自动完成并领奖」，工具将查询官方技能池并调用 /v2/user-asset/skill/install 安装技能',
        '自动在云端会话中使用该技能并上报 skill_detail_show / skill_installed / skill_action 等官方埋点后自动领奖',
      ],
      autoNote: '尝鲜达人任务：已接入官方技能安装与技能使用上报协议。',
    };
  }

  // 11. Knowledge Base
  if (title.includes('资料库')) {
    return {
      category: 'client_action',
      targetUrl: webWorkspaceUrl,
      growthCenterUrl,
      steps: [
        '点击下方「立即自动完成并领奖」，工具将访问官方资料库 NetDrive/TDrive 列表接口并触发文件同步事件',
        '上报 web_page_show / asset_cloud_list_show / asset_cloud_sync 埋点并完成对话后立即尝试领奖',
      ],
      autoNote: '资料库任务：已接入官方网盘鉴权与资料库页面行为埋点协议。',
    };
  }

  // 12. AI Chat 5x / Desktop Chat 1x
  if (title.includes('AI 聊天') || title.includes('AI聊天') || title.includes('桌面端对话')) {
    return {
      category: 'client_action',
      samplePrompt: '你好，请帮我列举 3 条高效办公的时间管理技巧。',
      targetUrl: webWorkspaceUrl,
      growthCenterUrl,
      steps: [
        '点击下方「立即自动完成并领奖」，工具将自动创建会话并发送真实对话消息轮次',
        '完成指定次数后等待服务端校验进度，再自动清理临时会话并领取奖励',
      ],
      autoNote: '对话类任务：会先发送真实对话消息并在进度核验后清理，不再秒删空会话。',
    };
  }

  return {
    category: 'client_action',
    targetUrl: growthCenterUrl,
    growthCenterUrl,
    steps: [
      `查看任务要求：${task.reason || task.name}`,
      '点击下方「立即自动完成并领奖」自动上报事件并领取积分',
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
  const [qrImgSrc, setQrImgSrc] = useState('./workbuddy-wechat-mp-qr.png');
  const [resultFeedback, setResultFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  if (!isOpen || !task) return null;

  const safeTask = sanitizeTaskProgress(task);
  const recipe = getTaskRecipe(safeTask);
  const isWeChatTask = recipe.category === 'wechat_24h';

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
      const res = await onExecuteAndClaim(safeTask);
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
              {isWeChatTask ? <QrCode className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-100 text-sm">{safeTask.name}</h3>
                <span className="px-2 py-0.5 text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">
                  +{safeTask.reward} 积分
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                当前进度: {safeTask.currentProgress}/{safeTask.targetProgress} · 状态: {safeTask.status}
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
            <div className="text-slate-200 leading-relaxed">{safeTask.reason}</div>
          </div>

          {/* Dedicated Official WeChat QR Code Card for 关注「腾讯 WorkBuddy」官方公众号 */}
          {isWeChatTask && (
            <div className="p-4 bg-gradient-to-b from-emerald-950/40 to-slate-950 border border-emerald-500/30 rounded-2xl flex flex-col items-center text-center space-y-2.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-medium">
                <QrCode className="w-3.5 h-3.5" />
                <span>微信扫一扫 · 立即关注「腾讯 WorkBuddy」官方公众号</span>
              </div>

              <div className="p-2.5 bg-white rounded-xl shadow-lg border-2 border-emerald-500/40">
                <img
                  src={qrImgSrc}
                  alt="腾讯 WorkBuddy 官方公众号二维码"
                  referrerPolicy="no-referrer"
                  className="w-44 h-44 object-contain rounded-lg"
                  onError={() => {
                    if (
                      qrImgSrc !==
                      'https://download.codebuddy.cn/web/docs/f35a54ab268600af7acf84d08301d5e697984514/docs/static/contact-wechat-mp.QHyrKArB.png'
                    ) {
                      setQrImgSrc(
                        'https://download.codebuddy.cn/web/docs/f35a54ab268600af7acf84d08301d5e697984514/docs/static/contact-wechat-mp.QHyrKArB.png'
                      );
                    }
                  }}
                />
              </div>

              <p className="text-[11px] text-slate-300 max-w-xs leading-relaxed">
                使用绑定当前 WorkBuddy 账号的微信扫码关注，保持关注满 <strong className="text-emerald-400">24 小时</strong> 后点击下方按钮即可直接领取 <strong className="text-emerald-400">100 积分</strong>。
              </p>
            </div>
          )}

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
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 flex items-center gap-1 shrink-0 transition-colors cursor-pointer whitespace-nowrap"
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
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 flex items-center gap-1 shrink-0 transition-colors cursor-pointer whitespace-nowrap"
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
            <div className="text-slate-300 font-medium">自动执行原理与说明：</div>
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
              onClick={() => triggerExternalDownload(recipe.growthCenterUrl)}
              className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
              <span>打开官方成长中心</span>
            </button>

            {!isWeChatTask && (
              <button
                type="button"
                onClick={() => triggerExternalDownload(recipe.targetUrl)}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                <span>打开网页工作台</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleRunExecute}
              disabled={isExecuting}
              className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl shadow-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              {isExecuting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : safeTask.status === '已领奖' ? (
                <Gift className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>
                {isExecuting
                  ? '正在执行并同步积分...'
                  : isWeChatTask
                  ? '同步关注状态并立即领奖'
                  : '立即自动完成并领奖'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
