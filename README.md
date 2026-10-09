# iskill-workbuddy-deepseek

> **WorkBuddy 专用。** 本技能依赖 WorkBuddy 内置浏览器的分区目录
> （`~/.workbuddy-ai/app/session/Partitions/`）来读取 DeepSeek 登录态。
> 换成 Codex / Claude Code / Cursor 等客户端没有这个路径，脚本无法工作。

在 **WorkBuddy 内置浏览器**里用免费的 DeepSeek 网页版做讨论，再把对话内容一句话交给付费 agent 执行 ——
**不用外部 Chrome，不用在两个应用之间切换。**

反向也通：把 agent 的产出放到剪贴板，粘回 DeepSeek 继续聊（`push`，零网络请求）。

![方案架构：只读登录态](assets/architecture.svg)

## 它解决什么问题

DeepSeek 网页版免费、不耗 token，适合**讨论与规划**；WorkBuddy / Codex 付费，适合**编码执行**。
痛点从来不是「能力不够」，而是**两边切换、上下文要手动搬运**。

本技能把搬运压缩成一句话：

```
你：在 WorkBuddy 内置浏览器面板里和 DeepSeek 聊
你：「同步一下 DeepSeek 最新对话」
我：跑 ds-sync.mjs → 对话全文进入我的上下文，接着干活
```

## 怎么做到的

关键在于**不去驱动浏览器，只读它的登录态**。

| 事实 | 说明 |
|---|---|
| 内置浏览器**驱动不了** | 它是 Electron webview，**没有暴露 CDP 调试端口**，分区里也没有 `DevToolsActivePort` |
| 但它的**分区在磁盘上** | `~/.workbuddy-ai/app/session/Partitions/<name>/Local Storage/leveldb` |
| `userToken` 就在里面 | DeepSeek 网页版把凭证存在 `localStorage.userToken`，形如 `{"value":"<64位不透明token>","__version":"0"}` |
| 拿到 token 就能**只读**拉对话 | 三个 GET 接口，见下 |

### 用到的接口（全部 GET）

| 接口 | 用途 |
|---|---|
| `/api/v0/users/current` | 验证 token、取账号 |
| `/api/v0/chat_session/fetch_page?count=N` | 会话列表 |
| `/api/v0/chat/history_messages?chat_session_id=<id>` | 会话全文 |

消息正文在 `fragments[]` 里（**不在顶层 `content`**，该字段是空的，极易误判）：

| `type` | 含义 | 默认 |
|---|---|---|
| `REQUEST` | 用户的话 | 包含 |
| `THINK` | 模型思考过程（可能上万字） | 省略，`--think` 才包含 |
| `RESPONSE` | 模型正式回答 | 包含 |

## 快速开始

零三方依赖（Node 内置模块即可）。

```bash
NODE=~/.workbuddy-ai/binaries/node/versions/22.22.2-3/bin/node
S=<本目录>/scripts/ds-sync.mjs

$NODE $S status                  # 登录状态 + 账号 + 分区定位
$NODE $S list --count 20         # 最近会话列表（带序号）
$NODE $S pull --latest           # 导出最近一次会话为 markdown（默认 stdout）
```

实际输出示例：

```
$ node ds-sync.mjs status
分区      : wb-webview-<uuid>-browser-preview
接口验证  : OK
账号      : 山海梦   (WECHAT 登录)
token     : Cz4LsMLC...MlTw6g (64 字符)

$ node ds-sync.mjs list --count 3
 1. 2026-09-22 18:50  取消喜酒惩戒分析   [555576e1-...]
 2. 2026-08-07 10:18  身心疗愈师        [999f4efb-...]
 3. 2026-07-17 20:28  EWC今日赛程       [59fc196a-...]
```

## 命令一览

| 命令 | 说明 |
|---|---|
| `status` | 登录状态、账号、定位分区 |
| `partitions` | 列出所有分区及其 token 情况（排查用） |
| `list [--count N]` | 会话列表 |
| `pull --latest` | 最近一次会话 |
| `pull --title <关键字>` | 按标题模糊匹配 |
| `pull --id <session_id>` | 按 ID |
| `pull --index <n>` | 按 `list` 序号（1 起） |
| `push --file <路径>` | **反向**：把内容放进剪贴板，由你粘到面板（WorkBuddy → DeepSeek） |

选项：`--think`（含思考过程）· `--tail N`（只取最后 N 条）· `--out <path>`（写入文件）· `--raw`（原始 JSON）· `--json`

`push` 专用：`--file <路径>` · `--text "..."` · `--no-header`（不加抬头）· `--no-copy`（只统计，不碰剪贴板）

`push` **不需要登录态** —— 它不读 token、不发任何请求。

### 打开 DeepSeek（agent 指令，且是默认动作）

`status` / `list` / `pull` / `push` 之外还有一个高频动作：**让 agent 打开 DeepSeek 面板**。

- 触发：对 agent 说「打开 DeepSeek」「我要和 DeepSeek 聊」；**或只笼统说「同步一下」没给具体要求时，agent 也会默认先开面板**。
- 实现：agent 调 `present_files` 传 `https://chat.deepseek.com/`，页面即在 WorkBuddy 内置浏览器面板打开。
- 场景：首次扫码登录；拉取时边看原文边等结果；或 `push` 前发现面板没开着。

这个动作不需要跑 `ds-sync.mjs`——内置浏览器没有自动化接口，但 `present_files` 的 URL 预览通道恰好落在它身上。

## 风险边界

这是本项目的核心设计约束，请务必理解：

- ✅ 只调 **GET 只读**接口：列会话、取历史消息
- ✅ **不调** `/chat/completion`、**不做** PoW、**不做** prompt 注入、**不高频轮询**
- ✅ 真正的「生成」始终发生在**真实浏览器**里，指纹与 `device_id` 都是真的
- ⚠️ 但仍是**非浏览器 HTTP 客户端**（TLS / UA 指纹与 Chrome 不同），属**低但非零**风险
- ⚠️ 因此：**按需调用，不要轮询、不要批量刷**

> 这与「把网页版封装成 OpenAI API」**不是一个量级**：那个方案要高频调用 completion 并做 prompt 注入，
> 已被大量封号案例证伪（详见 `docs/DeepSeek网页版转API-可行性评估.md`）。本方案**不碰生成链路**。

**反向（`push`）的风险是零。** 它只把文本放进系统剪贴板，**完全不碰网络**，由你自己粘贴到面板里。

> ⚠️ **本项目刻意不做「自动发消息到 DeepSeek」。** 那需要 `POST /chat/completion` + PoW，
> 等于把已经排除掉的高风险方案重新引进来。发送这一步永远留给人。

## 排查

| 现象 | 原因 / 处理 |
|---|---|
| 找不到已登录会话 | 没在内置浏览器面板登录 DeepSeek。让 agent「打开 DeepSeek」（present_files 开 URL），扫码登录即可 |
| `status` 显示接口验证失败 | token 过期。面板刷新 / 重登一次；脚本每次都重新读磁盘，无需手动同步 |
| **账号和刚登录的对不上**（读出旧账号） | webview 的 localStorage 未 flush 到磁盘，脚本读的是落盘态（看 `token 落盘` 时间）。关闭面板重开、等 2 秒重跑即可 |
| `partitions` 某分区显示「未登录 (value=null)」 | 该分区是空壳，正常。挑显示「已登录」的那个 |
| 会话列表为空 | 账号确实没有历史会话，或接口变更。用 `--raw` 看原始返回 |
| 找不到标题匹配 | 用 `list` 看准确标题，注意全角 / 半角与空格 |
| `push` 报「没找到可用的剪贴板命令」 | 系统缺 `pbcopy`/`clip`/`wl-copy`/`xclip`。改用 `--out <路径>` 写文件后手动复制 |
| `push` 之后剪贴板没变 | 检查是否误加了 `--no-copy`；空内容会以退出码 8 拒绝 |

## 已知限制

- 依赖 DeepSeek 网页版的**私有接口**，官方改版即失效；`--raw` 是第一排查手段。
- token 是**账号级凭证**，脚本会直接从磁盘读。**不要把导出物或 token 提交到仓库。**
- **对 DeepSeek 只能读。** `push` 只把内容送到剪贴板，**发送动作必须由人完成** —— 这是刻意的风险边界，不要绕过。

## 目录结构

```
iskill-workbuddy-deepseek/
├── SKILL.md                    # 技能清单（agent 读取）
├── README.md                   # 本文件（人读）
├── LICENSE                     # MIT
├── assets/
│   └── architecture.svg        # 方案架构图
├── docs/
│   ├── DeepSeek网页版桥接-方案.md          # 方案演进 + 踩坑存档
│   └── DeepSeek网页版转API-可行性评估.md    # 封号风险论证
├── promo-page/                 # 中英双语落地页（发布到 gh-pages）
└── scripts/
    └── ds-sync.mjs             # 零依赖 CLI（status / list / pull / push）
```

## 历史背景

早期实现过「外部 Chrome + CDP + agent-browser」的搬运方案，能跑通但**必须开两个应用**，被否决。
本技能是替代方案：**只读登录态**，因此不需要任何额外浏览器进程。

外部 Chrome 路线的完整踩坑记录（Chrome 装在外置卷导致误报未安装、`--no-sandbox`、`setsid` 回收、
agent-browser 连上后新建自己的标签页等）保留在 `docs/DeepSeek网页版桥接-方案.md`。

> 依赖同步：本仓库含 iskill 共享真源的 vendored 副本（清单见 `package.json` 的 `iskillDeps`），**不要手改**。使用前请同时安装 iskill-utils：对 agent 说「请帮我安装 Skill：aispin/iskill-utils」；用法见 SKILL.md「依赖同步」节。
