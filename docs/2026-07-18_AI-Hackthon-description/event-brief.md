# 赛事简报 — {Tech: Europe} x Almedia Hackathon「The Summer Lock-In」(2026-07-18)

> 供 INTAKE 直接引用的赛事约束提取。来源：本目录赛事手册（`Tech Europe x Almedia Hackathon The Summer Lock.md`）与 Tavily 指南 PDF。启动 Run 后，把本简报中的 FACT/UNKNOWN 复制进 `run.json.challenge` 并按事件流补充；本文件本身只是 supporting evidence。

## FACT（来自官方手册）

- 日程：09:30 开门；10:00 开幕与组队；12:30 午餐；**19:00 参赛确认与项目提交截止**；20:00 现场 Demo；20:45 颁奖。
- 队伍 ≤5 人，允许 solo；项目必须是本次黑客松新建（**允许使用 boilerplate**）。
- 必须使用 **≥1 项合作伙伴技术**：OpenAI（API 代金券发到 Luma 邮箱；Codex 兑换码在 `chatgpt.com/p/<promo>`）、Tavily（Agent 联网搜索，指南 PDF 在本目录）、Cognee（开源 Agent 记忆平台，免费账号 + docs.cognee.ai）。
- 提交物：**2 分钟视频 Demo**（Loom 或同类；需包含方案详细说明 + 关键功能 live walkthrough）+ **公开 GitHub 仓库**（完整 README 安装说明、所有 API/框架/工具的清晰文档、足以支撑评审的技术文档）。
- 两阶段赛制：Stage 1 预选出 5 支决赛队（Open Track 3 + Cortea Track 2）；评审标准为 **creativity、technical complexity，有效使用伙伴技术加分**。Stage 2 现场 **5 分钟展示**，评出前 3。
- 奖项：冠军 600€ 现金 + $2.5k OpenAI credits；亚军 $1.5k；季军 $1k；总奖池 >2k€。
- Open Innovation 赛道：主题完全自由。

## UNKNOWN（需要现场确认，指定 owner 与截止时间）

- Cortea 赛道题目与奖品（手册标 TBA）→ 开幕时确认；影响赛道选择。
- 提交表单 URL（TBA）→ Discord 关注；18:00 前必须拿到。
- 是否新增伙伴技术（手册注明 more partners TBA）。
- Tavily/Cognee 的当日配额、API 细节 → 用本目录 PDF 与官方文档验证后才可标 FACT。

## 评审对齐（concept 打分时使用）

| 官方标准 | 对概念的要求 |
|---|---|
| Creativity | 十秒可懂的新颖 wow；不是又一个 chat 壳 |
| Technical complexity | 真端到端 Agent 流：前端 + 后端 + 持久化 + 真实调用链，可讲清架构 |
| Partner tech bonus | ≥1 项伙伴技术**承重**（在 hero flow 里，不是装饰）；OpenAI 打底，Tavily/Cognee 是差异化加分位 |

## 合规红线

- 19:00 前完成实际提交并拿到回执；`demo.md` 提交清单里的视频与公开仓库两项为硬性物。
- HDOS 框架属于 boilerplate（允许），但产品代码须为现场新建；README 中如实说明 boilerplate 与现场构建的边界。
- 视频 2 分钟内讲完方案 + 关键功能演示；Stage 2 备 5 分钟版 pitch。

## 建议时间盒（映射 HDOS 相位；锁定进 `run.json.competition.timeboxes`）

| 时间 | 相位 | 出口 |
|---|---|---|
| 10:00–10:45 | INTAKE | 规则 FACT 化；Product Strategist 三概念；人类选定 |
| 10:45–12:15 | SPEC（设计并行）| System Architect ∥ Experience Scout；必要时一轮交互深挖；**12:15 前设计锁定**（`EXPERIENCE_CONTRACT_FROZEN` + `TECH_BLUEPRINT_FROZEN`）|
| 12:15–16:30 | PLAN → IMPLEMENT → SELF_TEST | 蓝图任务包并行实现；tracer bullet 先行；午餐轮换 |
| 16:30–17:30 | REVIEW → RELIABILITY → INTEGRATE | 独立评审；失败/重放证据；固定 checkpoint |
| 17:30–18:30 | DEMO | 全状态证据；3 次彩排；录 2 分钟视频；README/文档补齐；提交包就绪 |
| 18:30–19:00 | SUBMIT | Reviewer 预检 → 人工提交 → 回执 → `verify:record` → SUBMIT |

## 启动命令

```bash
corepack enable && corepack prepare pnpm@11.7.0 --activate
pnpm install --frozen-lockfile
pnpm runtime:prepare && pnpm runtime:validate && pnpm test
pnpm hdos:init -- --run summer-lock-in-20260718
```

伙伴技术密钥名已在 `.env.example` 预留（`OPENAI_API_KEY` / `TAVILY_API_KEY` / `COGNEE_API_KEY`）；值只进本地 `.env`，永不入库。
