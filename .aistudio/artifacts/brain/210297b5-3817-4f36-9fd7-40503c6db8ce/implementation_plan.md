# WorkBuddy 账号日常工具 (workbuddyTool) Implementation Plan

Building a dedicated multi-account daily automation workspace replicating the user's reference screenshot (`WorkBuddy 账号日常工具 v0.5.9`). It supports local browser access, Electron desktop packaging for Windows `.exe`, multi-account Cookie/Token management, automated daily task execution and reward claiming, and automatic push to `https://github.com/dengwka/workBuddyTools`.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions were confirmed based on your requirements and clarifying answers:

- **Authentication Method**: Cookie / Token authentication for WorkBuddy accounts (with support for region selection: 国内版 / 国际版, and optional proxy configurations).
- **Task Execution Mode**: Dual-mode engine supporting both **Real API Proxy/Request execution** and **Simulation Demo mode** (with realistic task steps, points accrual, and live logs).
- **Packaging & Distribution**: Dual runtime: Web SPA on Vite + Electron configuration (`electron/main.ts`, `electron-builder.json`, npm scripts) ready to build standalone Windows `.exe` desktop application.
- **GitHub Target Repository**: `https://github.com/dengwka/workBuddyTools` using your provided GitHub PAT token for automatic terminal push upon completion.

---

## 1. Overview & Core Concept

- **What It Does**: A desktop-style automation and management workstation for WorkBuddy accounts. Users can add multiple accounts, view real-time point balances and cat travel ("猫猫旅行") status, inspect task checklists (status, progress, point rewards, failure/waiting reasons), and trigger one-click batch automation ("一键执行全部日常", "签到/每日活跃", "一键猫猫旅行", "完成任务并领奖").
- **Target Persona**: WorkBuddy power users managing multiple accounts who want automated daily rewards, quick status visibility, and the choice between running via local web browser or a packaged Windows desktop application.
- **Key Value**: Replaces tedious manual daily clicks across multiple accounts with unified batch orchestration, visual task failure diagnostics, and safe credential storage.

---

## 2. User Experience & Visual Design

Following the reference screenshot (`/public/assets/aistudio/934be8e6-d921-42fb-88d4-55353662b39b_a77df796.jpg`) and SaaS dashboard guidelines:

### Layout & Sections
1. **Window Title Bar**:
   - Native-feeling desktop title bar with icon, `WorkBuddy 账号日常工具 v0.5.9`, and standard window controls (minimize, maximize, close).
   - Quick header actions: `+ 添加账号` (with modal) and `刷新全部`.
2. **Metrics & Counter Ribbon**:
   - Clean horizontal strip: `总账号`, `排队`, `运行中`, `本轮成功`, `本轮失败`, `跳过`, and `最近刷新` timestamp.
3. **Left Column — Account Management Sidebar**:
   - Search input: `搜索昵称/区域`.
   - High-density table: columns `账号`, `区域` (国内版 / 国际版), `状态` (● 正常 / 异常 / 运行中).
   - Multi-select actions: `全选`, `反选`, `已选 X / 共 Y`, `删除所选`.
4. **Right Column — Account Detail & Task Central**:
   - Account banner: Account ID / nickname, region, last updated time, and highlighted **积分** (e.g. `3963 积分`).
   - **猫猫旅行 (Cat Travel) Card**:
     - Status badge: `今日已完成` / `旅行中` / `待出发`.
     - Real-time status description: e.g. `猫猫今日已完成旅行 (服务端标记 daily_limit_reached)`.
     - Controls: `☑ 自动旅行` toggle and `刷新状态` button.
   - **任务明细 (Task Breakdown) Table**:
     - Filter tabs: `全部`, `未完成`, `已领奖`.
     - Columns: `名称`, `状态` (已领奖, 需等待, 需人工, 进行中), `进度` (1/1, 5/5, 0/3...), `奖励` (100分, 300分...), `最近结果`, `原因`.
     - Tasks loaded from WorkBuddy daily specs (设置自动化任务, 召唤专家, 尝鲜热门技能, AI聊天, 夜猫子夜间折扣, 关注公众号, 体验Buddy应用等).
   - **Task Detail Inspector**:
     - Displays full `最近结果` and selectable, copyable `原因` when a task row is clicked.
5. **Bottom Sticky Execution Bar**:
   - Account scope: `● 全部账号` vs `○ 所选账号`.
   - Action triggers:
     - `一键执行全部日常` (Primary Emerald Green)
     - `签到 / 每日活跃` (Secondary Emerald Green)
     - `一键猫猫旅行` (Secondary Emerald Green)
     - `完成任务并领奖` (Neutral Action)
     - `取消` (Cancel ongoing batch)
     - Status indicator: `就绪` / `运行中 (第 2/5 项)`.
6. **Bottom Status & Log Ticker**:
   - Real-time log stream: `日志 · 最近: [67936417] 已开启自动旅行...` with `清空` button and expandable full log drawer.
7. **GitHub Push & Sync Modal**:
   - Integrated pusher pre-configured with `https://github.com/dengwka/workBuddyTools` and your token, showing commit progress and live repository link.

---

## 3. Key Product Decisions & Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        WorkBuddy Desktop Frame                         │
│  [Icon] WorkBuddy 账号日常工具 v0.5.9           [+ 添加账号] [刷新全部] │
├────────────────────────────────────────────────────────────────────────┤
│  1 总账号 · 0 排队 · 0 运行中 · 1 本轮成功 · 0 本轮失败 · 19:24 最近刷新 │
├──────────────────────────┬─────────────────────────────────────────────┤
│  Account Sidebar (280px) │  Account Workspace                          │
│  [搜索昵称/区域         ] │  67936417 国内版             3963 积分       │
│  ┌──────────────────────┐│  ┌────────────────────────────────────────┐ │
│  │账号   区域   状态     ││  │ 🐱 猫猫旅行 [今日已完成]   [☑自动旅行]  │ │
│  │67936417 国内 ●正常   ││  └────────────────────────────────────────┘ │
│  └──────────────────────┘│  任务明细              [全部] [未完成] [已领奖]│
│  [全选] [反选]           │  ┌────────────────────────────────────────┐ │
│  已选 1 / 共 1 [删除所选]│  │ 设置自动化任务  已领奖  1/1  100分     │ │
│                          │  │ 和 AI 聊天 5 次 已领奖  5/5  100分     │ │
│                          │  │ 参与「夜猫子」  需等待  0/3  100分     │ │
│                          │  └────────────────────────────────────────┘ │
│                          │  选中心任务: 最近结果 & 原因详情可复制       │
├──────────────────────────┴─────────────────────────────────────────────┤
│  (•)全部账号 ( )所选账号  [一键执行全部日常] [签到] [一键猫猫旅行] [领奖] │
├────────────────────────────────────────────────────────────────────────┤
│  日志 · 最近: [67936417] 猫猫旅行已完成 (daily_limit_reached)    [清空] │
└────────────────────────────────────────────────────────────────────────┘
```

### Technical Stack & Decisions:
- **UI Framework**: React 19 + TypeScript + Tailwind CSS with precise matching of desktop proportions, colors (`#16a34a` emerald primary, `#0f172a` slate background, high-density table padding).
- **State Management**: LocalStorage-persisted accounts store (`workbuddy_accounts_v1`), task definitions, execution queues, and audit logs.
- **Dual Execution Engine**:
  - `SimulationEngine`: Generates authentic delays, progresses task quotas, credits points, and records failure/waiting reasons (e.g. night owl window 23:00~06:00).
  - `HttpApiEngine`: Configured for direct API calls or local proxy routes if real WorkBuddy gateway cookies are supplied.
- **Electron Desktop Packaging**:
  - `electron/main.ts`: Main process configuring native Frameless / Window controls, local web loading, and IPC handlers.
  - `package.json`: Configured with `electron`, `electron-builder`, and packaging script `"build:exe": "npm run build && electron-builder --win"`.
- **Git Push Automation**:
  - Background shell execution using `git remote add` and `git push` directly to `https://github.com/dengwka/workBuddyTools` with the user's provided token.

---

## 4. Verification Plan

1. **Visual & Functional Verification**:
   - Verify all elements from the screenshot: title bar, summary metrics, account table with search/selection, cat travel card, task breakdown tabs, detail inspector, bottom execution buttons, and log console.
   - Verify "添加账号" modal allows configuring Account ID, Region, Cookie/Token, and auto-generates task state.
   - Test "一键执行全部日常", "签到 / 每日活跃", and "一键猫猫旅行" transitions (running states, progress updates, point incrementing, and live log updates).
2. **Build & Lint Verification**:
   - Co-execute `compile_applet` and `lint_applet` to ensure 0 TypeScript and build errors.
3. **GitHub Push Execution**:
   - Push the complete codebase to `https://github.com/dengwka/workBuddyTools` using the provided token and confirm commit SHA on remote main branch.
