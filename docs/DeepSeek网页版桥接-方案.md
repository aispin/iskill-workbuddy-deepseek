# DeepSeek 网页版 ↔ Agent 桥接方案

> 调研日期：2026-10-02
> 背景：DeepSeek 网页版免费（不耗 token），适合**讨论与规划**；WorkBuddy / Codex 付费，适合**编码执行**。痛点是两边切换、上下文要手动搬运。
> 已排除的路线：把网页版封装成 OpenAI API（封号风险，详见 `DeepSeek网页版转API-可行性评估.md`）

---

## 〇、重大更新（2026-10-02 晚）：已找到「全程不出 WorkBuddy」的方案

前面第一~四章的结论，建立在「agent 必须能**驱动**内置浏览器」这个前提上。实测证明驱动不了（Electron webview 无 CDP 端口）。
但后来发现：**根本不需要驱动它 —— 只需要读它的登录态。**

### 新方案（已实现并跑通）

| 步骤 | 说明 |
|---|---|
| 1 | 用户在 **WorkBuddy 内置浏览器面板**打开 `https://chat.deepseek.com/`，正常聊天 |
| 2 | 登录凭证 `userToken` 落在磁盘分区 `~/.workbuddy-ai/app/session/Partitions/wb-webview-<uuid>-browser-preview/Local Storage/leveldb` |
| 3 | agent 从磁盘读出 token，用**只读 GET 接口**把对话拉回来 |

### 本机实测结果

```
$ ds-sync.mjs status
分区      : wb-webview-b6df41a2-927d-466e-929c-77a8b2cae30e-browser-preview
接口验证  : OK
账号      : 山海梦   (WECHAT 登录)
token     : Cz4LsMLC...MlTw6g (64 字符)

$ ds-sync.mjs list --count 3
 1. 2026-09-22 18:50  取消喜酒惩戒分析   [555576e1-7b27-41c4-a765-a74542667a42]
 2. 2026-08-07 10:18  身心疗愈师        [999f4efb-8112-4d68-bc2a-e6d1cd6b3efa]
 3. 2026-07-17 20:28  EWC今日赛程       [59fc196a-cd63-4460-8f30-075076992bf2]
```

### 用到的接口（全部 GET，只读）

- `GET /api/v0/users/current` —— 验证 token、取账号
- `GET /api/v0/chat_session/fetch_page?count=N` —— 会话列表
- `GET /api/v0/chat/history_messages?chat_session_id=<id>` —— 会话全文

消息正文在 `fragments[]` 里（**不在 `content`**），`type` 取值为：

| `type` | 含义 |
|---|---|
| `REQUEST` | 用户的话 |
| `THINK` | 模型思考过程（可能上万字，默认省略） |
| `RESPONSE` | 模型正式回答 |

### 这带来了三个结论级变化

1. **不再需要外部 Chrome。** 方案 B（外部 Chrome + CDP）连同它的一堆坑（外置卷、`--no-sandbox`、`setsid`、agent-browser 新建标签页…）**全部作废**。
2. **不再有虚拟滚动截断问题。** 之前担心的「长对话被 DOM 虚拟滚动截断」是**读 DOM 路线独有的问题**；走接口拿到的是完整消息数组，**这个未知项直接消失了**。
3. **风险仍远低于封装 API。** 只调 GET 只读接口，**不碰 `/chat/completion`、不做 PoW、不做 prompt 注入**；生成始终发生在真实浏览器里。属**低但非零**风险 —— 按需调用，不要轮询。

### 交付物

`iskill-workbuddy-deepseek`（已软链到用户级 skills 目录 `/Users/lv/.workbuddy-ai/skills/`）

```bash
NODE=~/.workbuddy-ai/binaries/node/versions/22.22.2-3/bin/node
S=~/Workbuddy/ISkills/iskill-workbuddy-deepseek/scripts/ds-sync.mjs

$NODE $S status                 # 登录状态 + 账号
$NODE $S list --count 20        # 会话列表
$NODE $S pull --latest          # 导出最近一次会话为 markdown
$NODE $S pull --title 关键字     # 按标题模糊匹配
$NODE $S pull --latest --think  # 连思考过程一起导出
$NODE $S pull --latest --out x.md
```

> 下方第一~八章为**历史调研记录**（外部 Chrome 路线），保留作为踩坑存档；**结论已被本节取代**。

---

## 一、核心判断

**「搬运上下文」和「封装 API」是两件事，风险差一个量级。**

| | 封装 API | 搬运上下文 |
|---|---|---|
| 行为 | 程序化发送 completion 请求 + prompt 注入 | 你正常聊天，agent 只**读取**页面 |
| 请求特征 | 伪造 App 请求头、无浏览器行为 | 真实浏览器、真实用户行为 |
| DeepSeek 看到什么 | 「一个异常客户端在批量调用」 | 「一个正常用户在用网页版」 |
| 封号风险 | 高（见 issue #112，最克制用法仍 3/4 阵亡） | **与你自己用网页版相同** |

**结论：桥接方案的关键设计原则是 —— agent 只读不写。**
只要不自动化"发送消息"这个动作，DeepSeek 侧的风控画像不发生变化。

---

## 二、实测发现

### 2.1 已打通的能力（本机实测通过）

| 能力 | 状态 | 说明 |
|---|---|---|
| `agent-browser` CLI | ✅ 已装 | v0.27.0，vercel-labs，自带 Chromium |
| CDP 连接真实 Chrome | ✅ 验证通过 | `agent-browser connect 9222` |
| 读取页面文本 | ✅ 验证通过 | 成功读到 `chat.deepseek.com` 页面内容 |
| 持久化登录态 | ✅ 有官方支持 | `state save/load`、`AGENT_BROWSER_SESSION_NAME` |

端到端链路已跑通：**Chrome（调试端口）→ CDP → agent-browser → 页面文本**。

### 2.2 踩坑记录：为什么"找不到 Chrome"

**现象**：`browser-cdp` 技能的探测脚本报 `CHROME_INSTALLED=no`，但 Chrome 明明装着。

**根因（两层）**：

1. **Chrome 装在外置卷上**。实际路径是
   `/Volumes/Pluto/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`（版本 154.0.8037.97），
   而探测脚本只检查硬编码的 `/Applications/Google Chrome.app/...`。
2. **`/Applications/Google Chrome` 是个 Finder 别名文件**（1260 字节，`MacOS Alias file`），**不是目录**。
   即使按 `/Applications` 找，`ls` 看着"有"，`[ -d ]` 却为假。

**教训**：不要硬编码 Chrome 路径，也不要只看 `/Applications`。应当
① 优先用 `CHROME_BIN` 环境变量；
② 遍历 `/Volumes/*/Applications/`；
③ 兜底用 `mdfind "kMDItemCFBundleIdentifier == 'com.google.Chrome'"`。
本方案的 `deepseek-bridge.sh` 已按此实现 `find_chrome()`。

**另注**：Chrome 的用户数据（`~/Library/Application Support/Google/Chrome/`）是存在的，
说明 Chrome 确实在用 —— 这也是当初"探测说没装、但数据在"这个矛盾的来源。

### 2.3 其他必须知道的坑

| 坑 | 现象 | 解法 |
|---|---|---|
| **Chrome 起不来** | `sandbox initialization failed: Operation not permitted` → GPU 进程崩溃 → `FATAL: GPU process isn't usable. Goodbye.` | 加 `--no-sandbox --disable-gpu --disable-dev-shm-usage`。WorkBuddy 的沙箱会阻断 Chrome 自身的 sandbox 初始化 |
| **后台进程被回收** | `nohup ... &` 起的 Chrome 在命令结束后消失 | 用 `setsid` 彻底脱离，或走 WorkBuddy 的后台任务 |
| **`--profile` 不生效** | `⚠ --profile ignored: daemon already running` | `--profile` 只在守护进程未运行时生效；先 `close --all`。日常持久化用 `state save/load` 更可靠 |
| **看不到用户的活动标签页** | `tab list` 只显示 `[t1] about:blank` | agent-browser 连上后会**新建自己的标签页**。解法：从 CDP `/json/list` 读出用户的活动 URL，再让 agent 的标签页导航过去（DeepSeek 会话在服务端，同 URL 即同对话） |
| **shell 变量后接全角字符** | `$PORT）` 报 `unbound variable` | 全角括号紧跟变量名会被 shell 当成变量名的一部分，一律写 `${PORT}` |

### 2.3 关于「WorkBuddy 内置浏览器」的实测结论

用户的核心诉求是**在 WorkBuddy 内部打开 DeepSeek，避免两个应用来回切**。实测结论如下：

| 检查项 | 结果 |
|---|---|
| 内置浏览器是否存在 | ✅ 存在。分区位于 `~/.workbuddy-ai/app/session/Partitions/`，其中 `agent-browser-preview-webview` 是预览用的 webview |
| 能否打开外部 URL | ✅ 可以。`present_files` 支持传 http/https URL，会在内置浏览器面板中打开 |
| **agent 能否读取其内容** | ❌ **不能**。WorkBuddy 的 Electron **没有暴露 CDP 调试端口** |
| 分区内是否有 `DevToolsActivePort` | ❌ 无 |

**全端口扫描结果**：本机 31 个监听端口中只有 2 个是 CDP 端点 ——
`9222`（本方案的 bridge Chrome）和 `50047`（实测为 **agent-browser 自己的 Chrome for Testing**，
路径 `~/.agent-browser/browsers/chrome-154.0.8037.92/`，临时 profile，与 WorkBuddy 无关）。

**因此存在一个真实的取舍**：

| | 应用内集成（内置浏览器） | 自动搬运（外部 Chrome + CDP） |
|---|---|---|
| 是否要切应用 | ✅ 不用，全在 WorkBuddy 里 | ❌ 要，WorkBuddy + Chrome 两个窗口 |
| 上下文搬运 | ❌ 手动复制粘贴（agent 读不到） | ✅ 一句话让 agent 自己读 |
| 登录态 | 待验证 | 已验证可持久化 |

**这不是技术缺陷，是能力边界**：内置浏览器是给「预览本地页面」设计的，没有开放自动化接口。
如果 WorkBuddy 未来开放 webview 的调试端口，这个取舍就会消失。

---

## 三、方案对比

| 方案 | 做法 | 封号风险 | 是否要切应用 | 搬运方式 | 工作量 |
|---|---|---|---|---|---|
| **A. 内置浏览器 + 手动复制** | 用 `present_files` 把 `chat.deepseek.com` 开在 WorkBuddy 内置浏览器面板 | 无 | ✅ **不用** | 手动 Cmd+C / Cmd+V | 0 |
| **A+. 内置浏览器 + 剪贴板桥** | 同 A，但复制后对 agent 说「读剪贴板」，agent 跑 `pbpaste` | 无 | ✅ **不用** | 一次复制 + 一句话 | 极低 |
| **B. 外部 Chrome + CDP 只读桥**（已打通） | 独立 Chrome 窗口聊 DeepSeek，agent 经 CDP 读取对话 | **无额外风险** | ❌ 要（两个窗口） | **全自动** | 已完成 |
| **C. 浏览器插件一键导出** | DeepSeek 页面装 userscript，一键导出 markdown 到剪贴板 | 无 | 视宿主而定 | 一次点击 + 粘贴 | 低 |
| **D. 反向桥** | agent 把代码/报错经 CDP 填入 DeepSeek 输入框 | ⚠️ **有风险**（变成自动化发送） | ❌ 要 | 自动 | 低 |
| ~~E. 封装为 API~~ | 反代网页版为 OpenAI 接口 | ❌ **高**（已否决） | ✅ 不用 | 全自动 | 4–7 周 |

> **A 与 B 是两条互斥的取舍**：A 解决"切应用"，B 解决"手动搬运"，但**目前无法同时满足**——
> 因为 WorkBuddy 的内置浏览器不开放自动化接口（见 2.3）。
> 日常建议：**主用 A+**（一个应用、一次复制），需要搬运大段上下文时切到 B。

> **方案 D 的边界**：写入输入框但**不点发送**，风险仍可控（等于帮你粘贴）。
> 一旦自动点发送，就跨到了"自动化发送"，风控画像改变 —— **不建议**。

---

## 四、推荐方案（B）架构

```
┌─────────────────────────────────────────────┐
│  Chrome（独立 profile，调试端口 9222）        │
│                                             │
│   你在标签页 A 里正常和 DeepSeek 聊天         │
│   ← 完全正常的用户行为，零额外风险            │
└─────────────────────────────────────────────┘
                    │
                    │  CDP 只读
                    ↓
        agent-browser connect 9222
                    │
                    │  读活动标签页 URL → 导航到同一 URL
                    │  eval 'document.body.innerText'
                    ↓
        WorkBuddy agent 拿到对话全文
                    │
                    ↓
        注入当前聊天窗口 / 落成计划文件
```

### 配套：以文件为交接媒介（强烈建议）

讨论的产物通常是**计划/规格**，它本来就该是文档而不是聊天记录。所以最佳实践是：

```
DeepSeek 讨论 → agent 读取 → 落成 plans/xxx.md → agent 读文件执行
```

比"粘贴到聊天框"更干净：可版本化、可复查、可跨会话复用。

---

## 七、关于 token 与登录：OAuth 可行吗？

**结论：不存在面向第三方的 DeepSeek OAuth，而且即使存在也省不掉人工步骤。**

- DeepSeek 登录页上的「Login with Apple」「微信扫码」是**它自己登录页的身份源**，
  不是给外部客户端换 token 的公开 OAuth 接口。
- 这些流程本身仍需人工交互（扫码、输 Apple ID 密码），
  所以「改用 OAuth」只是换个按钮点，**不减少任何人工步骤**。
- 另外注意：**本方案根本不需要 token**。桥接靠读取 DOM，只要页面处于登录态即可，
  不需要解析或持有凭证。

### 免重复登录的三条实际路线

| 路线 | 做法 | 前提 | 代价 |
|---|---|---|---|
| **token 迁移** | 从已登录的浏览器读出 `userToken`，注入 bridge profile | 需先在**某处**登录成功 | localStorage 不加密（cookie 才加密），技术上可行 |
| **agent-browser auth** | `auth save` 存账号密码 → `auth login` 自动填表 | DeepSeek 支持「Login with password」✅ | 要本地存密码；自动登录本身属于自动化行为 |
| **手动登一次** | 在 bridge 窗口登一次，profile 持久化 | 无 | 一次性 |

### 实测：当前没有任何一处处于登录态

```
主力 Chrome (Default) 的 Local Storage：
  userToken        存在，最长值 = 0   ← 键在，值为空
  settingsJwt      存在，最长值 = 0
  __appKit_userInfo  不存在
bridge profile：无有效 userToken（值为 {"value":null,...} 占位）
```

即**token 迁移目前没有源可迁**——需要先在一个浏览器里真正登录成功。

### 判断登录是否成功的方法

```js
const o = JSON.parse(localStorage.getItem("userToken"));
o && o.value ? "已登录" : "未登录"     // 未登录时是 {"value":null,...}，长度约 30
```
最直观的信号：登录成功后页面会**自动跳离 `/sign_in`**。

### ⚠️ 安全提醒

- **token 迁移 = 把账号的完整访问凭证复制到另一个 profile**。
  自己的机器、自己的账号没问题，但要知道 `~/chrome-agent-bridge` 这个目录
  **等同于账号访问权**，要当敏感数据处理，不要外传或同步到云端。
- 若走 `agent-browser auth`，密码会保存在本地。用 `--password-stdin` 可避免进入 shell 历史，
  但它仍然是本地存储的凭据，同样要按敏感数据对待。

---

## 八、使用步骤

```bash
cd /Users/lv/Workbuddy/ISkills/deepseek-bridge

# 1) 启动（首次需在弹出的 Chrome 窗口里登录 DeepSeek，登录态会保留）
./deepseek-bridge.sh start

# 2) 在 Chrome 里和 DeepSeek 正常聊天

# 3) 查看状态
./deepseek-bridge.sh status

# 4) 抓取当前会话全文（只读）
./deepseek-bridge.sh text

# 5) 用完关闭
./deepseek-bridge.sh stop
```

日常用法：对 agent 说「把 DeepSeek 上当前的讨论拿过来」，
agent 执行 `text` 子命令拿到全文，再按你的要求整理或落成文件。

---

## 六、已知限制

1. **必须在桥接窗口里登录，主力 Chrome 的登录无效**。
   桥接用的是**独立 profile**（`~/chrome-agent-bridge`），与主力 Chrome（`~/Library/Application Support/Google/Chrome/`）完全隔离 ——
   你在主力 Chrome 里登录 DeepSeek，桥接窗口**仍然是未登录状态**。
   排查方法：在桥接窗口执行
   ```js
   const o = JSON.parse(localStorage.getItem("userToken")); o && o.value ? "已登录" : "未登录"
   ```
   未登录时该值是 `{"value":null,...}`（长度约 30 字符），容易误判成"有 token"。
   用 `./deepseek-bridge.sh focus` 可把桥接窗口置前。
2. **`agent-browser` 每次 `connect` 都会新建一个标签页**（`about:blank`），
   所以必须 `connect` → `open <url>` → 等待渲染，且要在**同一次调用**里完成。
   另：它看不到用户的活动标签页（`tab list` 只有自己的 `about:blank`）。
3. **SPA 渲染需要等待**。固定 `sleep 2` 不够，会读到登录页残留；脚本已改为轮询 `innerText` 长度直到稳定。
4. **`text` 抓的是页面纯文本**，包含侧边栏等噪声。精确提取需要针对 DeepSeek 的 DOM 选择器做适配；
   页面改版时选择器可能失效（但纯文本方案对改版更鲁棒）。
5. **Chrome 必须保持运行**。窗口关掉，桥就断了。
6. **`--remote-debugging-port` 会把浏览器完全暴露给本机任何进程**
   （可读 cookie、执行 JS）。仅在本机可信环境下使用，用完 `stop`。
7. **没有验证过长时间/高频抓取是否影响风控**。保守起见按"你手动用的频率"来。

---

## 七、下一步可做

- [ ] 登录后验证真实会话的提取效果，确定精确选择器
- [ ] 把 `deepseek-bridge.sh` 封装成一个 iskill（含"读取 → 落成计划文件"的完整工作流）
- [ ] 评估是否需要"反向"能力（agent 把上下文写到剪贴板/文件，方便你粘给 DeepSeek）
- [ ] 修复 `browser-cdp` 技能的 Chrome 探测逻辑（硬编码路径问题），或向上游反馈
