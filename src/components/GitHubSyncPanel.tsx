import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  Github,
  CheckCircle2,
  AlertCircle,
  Loader2,
  UploadCloud,
  FolderGit2,
  PlusCircle,
  Terminal,
  Copy,
  Check,
  ExternalLink,
  Download,
  HelpCircle,
  Eye,
  EyeOff,
  GitCommit,
  GitBranch,
} from 'lucide-react';
import { GitHubUser, GitHubRepo, SyncLog } from '../types';
import { verifyGitHubToken, fetchUserRepos, createNewRepo, pushFilesToGitHub } from '../utils/githubApi';
import { CURRENT_PROJECT_FILES, downloadProjectZip } from '../utils/projectFiles';

interface GitHubSyncPanelProps {
  onOpenGuide: () => void;
}

export const GitHubSyncPanel: React.FC<GitHubSyncPanelProps> = ({ onOpenGuide }) => {
  // Token state: loaded securely from localStorage or env
  const [token, setToken] = useState(() => localStorage.getItem('gh_pat_token') || '');
  const [showToken, setShowToken] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  // Repositories
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<string>('workBuddyTools');
  const [targetBranch, setTargetBranch] = useState<string>('main');
  const [commitMessage, setCommitMessage] = useState<string>('feat: initial release of workbuddyTools v0.5.9');

  // New repo creation
  const [showCreateRepo, setShowCreateRepo] = useState(false);
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoDesc, setNewRepoDesc] = useState('Built with Google AI Studio DevTool Workspace');
  const [newRepoPrivate, setNewRepoPrivate] = useState(false);
  const [isCreatingRepo, setIsCreatingRepo] = useState(false);

  // Sync / Push process
  const [isPushing, setIsPushing] = useState(false);
  const [pushProgress, setPushProgress] = useState<{ step: string; percent: number }>({ step: '', percent: 0 });
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [lastCommitUrl, setLastCommitUrl] = useState<string | null>(null);

  // Copy state
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  // Validate saved token on mount if present
  useEffect(() => {
    if (token.trim()) {
      handleValidateToken(token);
    }
  }, []);

  const addLog = (type: SyncLog['type'], message: string) => {
    const newLog: SyncLog = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
    };
    setSyncLogs((prev) => [newLog, ...prev.slice(0, 40)]);
  };

  const handleValidateToken = async (tokenToTest: string) => {
    const cleanToken = tokenToTest.trim();
    if (!cleanToken) {
      setTokenError('请输入 GitHub Personal Access Token');
      return;
    }

    setIsValidating(true);
    setTokenError(null);
    try {
      const userData = await verifyGitHubToken(cleanToken);
      setUser(userData);
      localStorage.setItem('gh_pat_token', cleanToken);
      addLog('success', `成功验证 Token！欢迎 @${userData.login}`);

      // Load repos
      setIsLoadingRepos(true);
      const userRepos = await fetchUserRepos(cleanToken);
      setRepos(userRepos);
      if (userRepos.length > 0 && !selectedRepo) {
        setSelectedRepo(userRepos[0].name);
      }
      setIsLoadingRepos(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '验证 Token 失败';
      setTokenError(msg);
      setUser(null);
      addLog('error', `Token 验证失败: ${msg}`);
    } finally {
      setIsValidating(false);
    }
  };

  const handleCreateRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !user) return;
    if (!newRepoName.trim()) {
      addLog('warning', '请输入仓库名称');
      return;
    }

    setIsCreatingRepo(true);
    try {
      addLog('info', `正在 GitHub 上创建仓库 ${user.login}/${newRepoName}...`);
      const created = await createNewRepo(token, newRepoName, newRepoDesc, newRepoPrivate);
      addLog('success', `仓库创建成功: ${created.full_name}`);
      setRepos((prev) => [created, ...prev]);
      setSelectedRepo(created.name);
      setShowCreateRepo(false);
      setNewRepoName('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '创建仓库失败';
      addLog('error', `创建仓库失败: ${msg}`);
    } finally {
      setIsCreatingRepo(false);
    }
  };

  const handlePushToGitHub = async () => {
    if (!token || !user) {
      addLog('warning', '请先输入并验证 GitHub Token');
      return;
    }
    if (!selectedRepo) {
      addLog('warning', '请选择目标仓库，或新建一个仓库');
      return;
    }

    setIsPushing(true);
    setLastCommitUrl(null);
    setPushProgress({ step: '准备上传文件...', percent: 5 });
    addLog('info', `开始上传代码到 ${user.login}/${selectedRepo} [${targetBranch}]...`);

    try {
      const result = await pushFilesToGitHub(
        token,
        user.login,
        selectedRepo,
        targetBranch,
        CURRENT_PROJECT_FILES,
        commitMessage,
        (step, current, total) => {
          const percent = Math.round((current / total) * 90);
          setPushProgress({ step, percent: Math.max(10, percent) });
        }
      );

      setPushProgress({ step: '上传成功！', percent: 100 });
      setLastCommitUrl(result.commitUrl);
      addLog('success', `全部代码已成功推送到 GitHub！Commit: ${result.commitSha.substring(0, 7)}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '推送失败';
      setPushProgress({ step: `推送出错: ${msg}`, percent: 0 });
      addLog('error', `代码推送失败: ${msg}`);
    } finally {
      setIsPushing(false);
    }
  };

  const handleDownloadZip = async () => {
    setIsDownloadingZip(true);
    try {
      await downloadProjectZip();
      addLog('success', '已打包下载项目源码 ZIP');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ZIP 打包失败';
      addLog('error', `下载失败: ${msg}`);
    } finally {
      setIsDownloadingZip(false);
    }
  };

  // Generate standard Git command for local terminal or asking AI
  const repoOwner = user?.login || 'YOUR_USERNAME';
  const repoNameVal = selectedRepo || 'my-awesome-tool';
  const gitCommand = `# 在项目根目录执行以下命令即可推送到 GitHub:
git remote remove origin 2>/dev/null || true
git remote add origin https://${token ? `${token}@` : ''}github.com/${repoOwner}/${repoNameVal}.git
git branch -M ${targetBranch}
git add .
git commit -m "${commitMessage.replace(/"/g, '\\"')}"
git push -u origin ${targetBranch}`;

  const copyGitCommand = () => {
    navigator.clipboard.writeText(gitCommand);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Introduction */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-900/50 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium mb-3">
              <Github className="w-3.5 h-3.5" />
              <span>全自动 GitHub 代码同步与上传服务</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              将小工具代码自动推送到你的 GitHub
            </h2>
            <p className="text-slate-300 text-sm mt-1.5 max-w-2xl leading-relaxed">
              支持两种方式：① 在本面板输入 Token <span className="text-emerald-400 font-medium">网页端一键直传</span>；② 或直接在对话中将 Token 与仓库名发给 <span className="text-indigo-400 font-medium">AI 助手</span>，由 AI 在终端执行提交推送。
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onOpenGuide}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl border border-slate-700/80 flex items-center gap-2 transition-all shadow-sm"
            >
              <HelpCircle className="w-4 h-4 text-indigo-400" />
              <span>如何获取 Token？</span>
            </button>
            <button
              onClick={handleDownloadZip}
              disabled={isDownloadingZip}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-xl flex items-center gap-2 transition-all shadow-md shadow-emerald-900/20 disabled:opacity-50"
            >
              {isDownloadingZip ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>下载项目 ZIP</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: GitHub Token & Target Repo Setup (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 1: Token Configuration */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-200 text-sm">第一步：配置 GitHub Personal Access Token</h3>
                  <p className="text-xs text-slate-400">需要授予 <code className="text-indigo-300">repo</code> 权限以允许推送代码</p>
                </div>
              </div>
              {user && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  已授权
                </span>
              )}
            </div>

            <div className="mt-4 space-y-3">
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 pr-24"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
                    title={showToken ? '隐藏' : '显示'}
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleValidateToken(token)}
                    disabled={isValidating || !token.trim()}
                    className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg disabled:opacity-40 transition-colors flex items-center gap-1"
                  >
                    {isValidating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '验证'}
                  </button>
                </div>
              </div>

              {tokenError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2 text-xs text-rose-300">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{tokenError}</span>
                </div>
              )}

              {/* User Profile Card */}
              {user && (
                <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img
                      src={user.avatar_url}
                      alt={user.login}
                      className="w-10 h-10 rounded-full border border-indigo-500/30 object-cover"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-100 text-sm">@{user.login}</span>
                        {user.name && <span className="text-xs text-slate-400">({user.name})</span>}
                      </div>
                      <span className="text-xs text-slate-400">拥有 {user.public_repos} 个公开仓库</span>
                    </div>
                  </div>
                  <a
                    href={user.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition-colors"
                    title="在 GitHub 打开"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Target Repository & Commit Settings */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg border border-purple-500/20">
                  <FolderGit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-200 text-sm">第二步：选择目标仓库与分支</h3>
                  <p className="text-xs text-slate-400">选择已有仓库或直接新建仓库</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateRepo(!showCreateRepo)}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1.5 transition-colors"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>{showCreateRepo ? '取消新建' : '+ 新建 GitHub 仓库'}</span>
              </button>
            </div>

            {/* Create new repo form toggle */}
            {showCreateRepo && (
              <form onSubmit={handleCreateRepo} className="p-4 bg-slate-950/90 border border-indigo-500/30 rounded-xl space-y-3">
                <div className="font-medium text-xs text-indigo-300">快速创建新仓库:</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">仓库名称 (Repository Name)</label>
                    <input
                      type="text"
                      value={newRepoName}
                      onChange={(e) => setNewRepoName(e.target.value)}
                      placeholder="e.g. my-awesome-tool"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">可见性</label>
                    <select
                      value={newRepoPrivate ? 'private' : 'public'}
                      onChange={(e) => setNewRepoPrivate(e.target.value === 'private')}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="public">公开 (Public)</option>
                      <option value="private">私有 (Private)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">简要描述 (Description)</label>
                  <input
                    type="text"
                    value={newRepoDesc}
                    onChange={(e) => setNewRepoDesc(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowCreateRepo(false)}
                    className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg hover:bg-slate-700 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingRepo || !newRepoName.trim()}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                  >
                    {isCreatingRepo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlusCircle className="w-3.5 h-3.5" />}
                    <span>立即创建</span>
                  </button>
                </div>
              </form>
            )}

            {/* Existing Repo Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">目标仓库 (Repository)</label>
                {isLoadingRepos ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                    <span>正在加载仓库列表...</span>
                  </div>
                ) : repos.length > 0 ? (
                  <select
                    value={selectedRepo}
                    onChange={(e) => setSelectedRepo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    {repos.map((r) => (
                      <option key={r.id} value={r.name}>
                        {r.name} {r.private ? '🔒' : '🌐'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={selectedRepo}
                    onChange={(e) => setSelectedRepo(e.target.value)}
                    placeholder="输入仓库名，如 my-tool"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5 flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
                  <span>目标分支 (Branch)</span>
                </label>
                <input
                  type="text"
                  value={targetBranch}
                  onChange={(e) => setTargetBranch(e.target.value)}
                  placeholder="main"
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Commit Message */}
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1.5 flex items-center gap-1.5">
                <GitCommit className="w-3.5 h-3.5 text-indigo-400" />
                <span>提交说明 (Commit Message)</span>
              </label>
              <input
                type="text"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="feat: release customized tool from AI Studio"
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Push Button & Progress */}
            <div className="pt-2">
              <button
                onClick={handlePushToGitHub}
                disabled={isPushing || !token || !selectedRepo}
                className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium text-sm rounded-xl shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {isPushing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{pushProgress.step || '正在上传...'} ({pushProgress.percent}%)</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    <span>一键推送到 GitHub 仓库 ({CURRENT_PROJECT_FILES.length} 个源文件)</span>
                  </>
                )}
              </button>

              {/* Success Result Banner */}
              {lastCommitUrl && (
                <div className="mt-3 p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between text-xs text-emerald-300">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>代码已成功推送！已更新至分支 <strong className="font-mono">{targetBranch}</strong></span>
                  </div>
                  <a
                    href={lastCommitUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 rounded-lg font-medium transition-colors"
                  >
                    <span>查看 Commit</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: AI Assistant Direct Push & Real-time Logs (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card: Assistant Push / CLI Generator */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
                  <Terminal className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-200 text-sm">方式二：交由 AI 助手在后台推送</h3>
                  <p className="text-[11px] text-slate-400">你只需把 Token 和仓库名发在对话里</p>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              如果你不想在网页上手动操作，只要在聊天中告诉我：
            </p>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono text-slate-300 space-y-1">
              <div className="text-indigo-400">“帮我推送到仓库：https://github.com/{repoOwner}/{repoNameVal}”</div>
              <div className="text-emerald-400">“我的 Token 是：ghp_xxxxxxxx”</div>
            </div>
            <p className="text-[11px] text-slate-400">
              AI 助手将直接在服务器终端执行 Git 命令自动上传，无需你在本地配置 Git 环境！
            </p>

            <div className="pt-2 border-t border-slate-800/80">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] text-slate-400">或者在你的本地终端手动运行：</span>
                <button
                  onClick={copyGitCommand}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                >
                  {copiedCmd ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedCmd ? '已复制命令' : '复制代码'}</span>
                </button>
              </div>
              <pre className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre leading-relaxed">
                {gitCommand}
              </pre>
            </div>
          </div>

          {/* Activity / Sync Logs */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-semibold text-slate-200 text-sm">运行日志与状态</h3>
              <span className="text-[11px] text-slate-500">{syncLogs.length} 条记录</span>
            </div>
            <div className="h-44 overflow-y-auto space-y-2 text-xs font-mono pr-1">
              {syncLogs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                  暂无操作记录。配置 Token 后点击验证或推送即可在此查看动态。
                </div>
              ) : (
                syncLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-2 rounded-lg text-xs leading-relaxed flex items-start gap-2 ${
                      log.type === 'success'
                        ? 'bg-emerald-950/40 border border-emerald-800/40 text-emerald-300'
                        : log.type === 'error'
                        ? 'bg-rose-950/40 border border-rose-800/40 text-rose-300'
                        : log.type === 'warning'
                        ? 'bg-amber-950/40 border border-amber-800/40 text-amber-300'
                        : 'bg-slate-950 border border-slate-800 text-slate-300'
                    }`}
                  >
                    <span className="text-[10px] text-slate-500 shrink-0">{log.timestamp}</span>
                    <span className="break-all">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
