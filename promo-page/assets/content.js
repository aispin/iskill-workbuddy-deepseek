/* ============================================================================
 * iskill-workbuddy-deepseek · 落地页内容
 *
 * 本技能解决的问题：讨论在免费的 DeepSeek 网页版，执行在付费的 agent 客户端，
 * 两边切换要手动搬运上下文。这个技能把搬运压成一句话，且全程不出 WorkBuddy。
 * ==========================================================================*/
window.PROMO = {
  name: "ISKILL-WORKBUDDY-DEEPSEEK",
  brand: "#4d6bfe",
  brand2: "#14b8a6",
  repo: "https://github.com/aispin/iskill-workbuddy-deepseek",
  repoLabel: "aispin/iskill-workbuddy-deepseek",
  license: "MIT",

  /* 只在 macOS 实测过。脚本用 os.homedir() 拼路径，理论上跨平台，
     但没在 Windows 上验证过分区布局 —— 按「已实测」照实写，别标 mac-windows。 */
  platform: { zh: "macOS 已实测", en: "macOS verified" },

  lang: {
    zh: {
      meta: {
        title: "ISKILL-WORKBUDDY-DEEPSEEK · DeepSeek 里讨论，WorkBuddy 里执行",
        description: "在 WorkBuddy 内置浏览器里用免费 DeepSeek 网页版做讨论，一句话把对话交给 agent 执行 —— 不用外部 Chrome，不用切应用。"
      },
      a11y: { skip: "跳到主要内容" },
      ui: { copy: "复制", copied: "已复制", failed: "复制失败" },
      nav: { features: "能力", shots: "截图", how: "上手", faq: "问答" },

      hero: {
        badge: "AI 技能",
        titlePre: "DeepSeek 里讨论，",
        titleAccent: "WorkBuddy 里执行",
        titlePost: "",
        sub: "网页版 DeepSeek 免费、不耗 token，适合讨论与规划。这个技能让你在 WorkBuddy 内置浏览器里聊完，说一句话，对话全文就进了 agent 的上下文 —— 不用开第二个浏览器，不用手动复制粘贴。",
        ctaPrimary: "复制安装提示词",
        ctaSecondary: "看源码",
        meta1: "零依赖",
        meta2: "只读",
        meta3: "macOS 已实测"
      },

      chat: {
        title: "AI Agent · 对话现场",
        status: "在线",
        userLabel: "你",
        agentLabel: "AI",
        messages: [
          { role: "user", text: "同步一下我在 DeepSeek 网页版最新那次讨论" },
          { role: "agent", text: "读到了，共 12 条消息（已省略思考过程）。内容已进上下文。", tag: "只读 GET · 未调用生成接口" },
          { role: "user", text: "按它的结论接着往下做" },
          { role: "agent", text: "好 —— 我按那份讨论的结论继续，有分歧的地方会先跟你确认。", tag: "上下文已接续" }
        ]
      },

      stats: [
        { value: "0", label: "额外浏览器进程", note: "只读内置浏览器的登录态" },
        { value: "1 句", label: "上下文交接", note: "「同步一下 DeepSeek」" },
        { value: "3", label: "只读接口", note: "GET，不碰生成链路" }
      ],

      compare: {
        eyebrow: "对比",
        title: "以前 vs 现在",
        sub: "",
        before: {
          title: "没有这个技能",
          items: [
            "在 Chrome 和 WorkBuddy 之间来回切窗口",
            "手动复制粘贴对话，长文还容易被虚拟滚动截断"
          ]
        },
        after: {
          title: "有了这个技能",
          items: [
            "全部在 WorkBuddy 内置浏览器里完成",
            "一句话交接，接口返回完整消息数组"
          ]
        }
      },

      features: {
        eyebrow: "能力",
        title: "它能做什么",
        sub: "",
        items: [
          { icon: "shield", title: "只读，不碰生成链路", desc: "三个 GET 接口。不调 /chat/completion、不做 PoW、不做 prompt 注入。" },
          { icon: "monitor", title: "不起第二个浏览器", desc: "读内置浏览器分区的登录态，不用外部 Chrome，不用在应用间切换。" },
          { icon: "layers", title: "完整对话，不被截断", desc: "走接口拿完整消息数组，不受 DOM 虚拟滚动影响。" },
          { icon: "bot", title: "思考过程可选", desc: "片段按 REQUEST / THINK / RESPONSE 分类，默认省略上万字的思考。" },
          { icon: "grid", title: "任选一次会话", desc: "最新 / 标题 / ID / 序号任选，打印到终端或写成 markdown。" },
          { icon: "check", title: "零依赖", desc: "纯 Node 标准库，无需 npm install。" }
        ]
      },

      showcase: {
        eyebrow: "实拍",
        title: "看一眼真东西",
        sub: "",
        items: [
          { src: "assets/architecture.svg", alt: "方案架构：只读登录态，全程不出 WorkBuddy", caption: "方案架构 —— 从外部 Chrome 改为只读内置浏览器登录态" }
        ]
      },

      steps: {
        eyebrow: "上手",
        title: "三步跑起来",
        sub: "命令由 agent 跑，你只说要什么、看结果。",
        items: [
          { title: "交给 AI 装", desc: "把这句话粘进对话框。装好后，首次需要在 WorkBuddy 内置浏览器面板里登录一次 DeepSeek —— 登录态会一直保留。", codeKey: "install" },
          { title: "聊完，说一句", desc: "在面板里和 DeepSeek 讨论完，回来跟 agent 说一句。怎么读、读哪一次，由它决定。", codeName: "prompt", code: "同步一下我在 DeepSeek 网页版最新那次讨论" },
          { title: "验收", desc: "agent 会把接到的内容告诉你。扫一眼确认是那次讨论，再让它接着往下做。" }
        ]
      },

      faq: {
        eyebrow: "问答",
        title: "常见问题",
        items: [
          { q: "会有封号风险吗？", a: "只调三个 <b>只读 GET</b> 接口，不碰 <code>/chat/completion</code>、不做 PoW、不做 prompt 注入；真正的生成始终发生在真实浏览器里。属<b>低但非零</b>风险 —— 按需调用，别轮询。" },
          { q: "为什么不用「外部 Chrome + CDP」那套？", a: "试过，能跑通，但必须同时开两个应用。WorkBuddy 内置浏览器没有暴露 CDP 端口，于是改成读它的登录态 —— 反而更简单，且不用起任何额外浏览器进程。" },
          { q: "能自动发消息给 DeepSeek 吗？", a: "不能，这是刻意的 —— 程序化发送正是封号风险的来源。反向搬运用 <code>push</code>：它只把内容放进剪贴板，你粘过去、自己按发送，全程零网络请求。" },
          { q: "Windows 能用吗？", a: "脚本用 <code>os.homedir()</code> 拼路径，理论上跨平台，但目前只在 macOS 实测过。Windows 上请自行验证分区路径。" },
          { q: "能不能不用 AI，手动装？", a: "可以。把仓库 clone 进你的 agent 技能目录就行 —— 纯文本加脚本，没有构建步骤。" }
        ]
      },

      cta: { title: "现在就接上", desc: "把提示词粘给 agent，讨论完一句话交接。", primary: "去 GitHub 看看", secondary: "复制安装提示词" },
      footer: { license: "MIT 许可", madeWith: "由 iskill-promo-page 生成" }
    },

    en: {
      meta: {
        title: "ISKILL-WORKBUDDY-DEEPSEEK · Plan in DeepSeek, execute in WorkBuddy",
        description: "Discuss on the free DeepSeek web app inside WorkBuddy's built-in browser, then hand the conversation to your agent in one line — no external Chrome, no app switching."
      },
      a11y: { skip: "Skip to content" },
      ui: { copy: "Copy", copied: "Copied", failed: "Copy failed" },
      nav: { features: "Features", shots: "Screens", how: "Get started", faq: "FAQ" },

      hero: {
        badge: "AI skill",
        titlePre: "Plan in DeepSeek, ",
        titleAccent: "execute in WorkBuddy",
        titlePost: "",
        sub: "The DeepSeek web app is free and burns no tokens — ideal for thinking. This skill lets you finish the discussion inside WorkBuddy's built-in browser, then hand the whole conversation to your agent with one sentence.",
        ctaPrimary: "Copy install prompt",
        ctaSecondary: "View source",
        meta1: "Zero deps",
        meta2: "Read-only",
        meta3: "macOS verified"
      },

      chat: {
        title: "AI Agent · live session",
        status: "online",
        userLabel: "You",
        agentLabel: "AI",
        messages: [
          { role: "user", text: "Sync my latest DeepSeek web conversation" },
          { role: "agent", text: "Got it — 12 messages, thinking stripped. The content is in context now.", tag: "read-only GET · no generation call" },
          { role: "user", text: "Continue from its conclusions" },
          { role: "agent", text: "On it — following that discussion's conclusions, and I'll check with you where it was ambiguous.", tag: "context carried over" }
        ]
      },

      stats: [
        { value: "0", label: "extra browser processes", note: "reads the built-in browser's session" },
        { value: "1 line", label: "handoff cost", note: "\"sync my DeepSeek chat\"" },
        { value: "3", label: "read-only endpoints", note: "GET only, never the generation path" }
      ],

      compare: {
        eyebrow: "Comparison",
        title: "Before vs after",
        sub: "",
        before: {
          title: "Without it",
          items: [
            "Switching windows between Chrome and WorkBuddy",
            "Copy-pasting by hand; long chats get clipped by virtual scrolling"
          ]
        },
        after: {
          title: "With it",
          items: [
            "Everything stays inside WorkBuddy's built-in browser",
            "One line to hand off; the API returns the full message array"
          ]
        }
      },

      features: {
        eyebrow: "Features",
        title: "What it does",
        sub: "",
        items: [
          { icon: "shield", title: "Read-only by design", desc: "Three GET endpoints. No /chat/completion, no PoW, no prompt injection." },
          { icon: "monitor", title: "No second browser", desc: "Reads the built-in browser's session state — no external Chrome, no app switching." },
          { icon: "layers", title: "Full conversation", desc: "The API returns the complete message array, so virtual scrolling can't clip it." },
          { icon: "bot", title: "Thinking optional", desc: "Fragments are typed REQUEST / THINK / RESPONSE; the huge thinking blocks are skipped by default." },
          { icon: "grid", title: "Pick any session", desc: "Latest, by title, by ID or by index — print to stdout or write a markdown file." },
          { icon: "check", title: "Zero dependencies", desc: "Plain Node standard library. No npm install." }
        ]
      },

      showcase: {
        eyebrow: "Screens",
        title: "See the real thing",
        sub: "",
        items: [
          { src: "assets/architecture.svg", alt: "Architecture: read-only session state, all inside WorkBuddy", caption: "Architecture — from external Chrome to reading the built-in browser's session" }
        ]
      },

      steps: {
        eyebrow: "Get started",
        title: "Up and running in three steps",
        sub: "The agent runs the commands. You only say what you want and check the result.",
        items: [
          { title: "Let your agent install it", desc: "Paste the line into the chat. Then sign in to DeepSeek once in WorkBuddy's built-in browser panel — the session persists.", codeKey: "install" },
          { title: "Discuss, then say one line", desc: "Finish your discussion in the panel, come back and say one sentence. The agent decides how and which session to read.", codeName: "prompt", code: "Sync my latest DeepSeek web conversation" },
          { title: "Check the result", desc: "The agent shows you what it picked up. Glance at it to confirm it's the right discussion, then let it continue." }
        ]
      },

      faq: {
        eyebrow: "FAQ",
        title: "Frequently asked",
        items: [
          { q: "Is there a ban risk?", a: "It calls three <b>read-only GET</b> endpoints. It never touches <code>/chat/completion</code>, never solves a PoW, never injects prompts. All actual generation happens in the real browser. Risk is <b>low but not zero</b> — call on demand, never poll." },
          { q: "Why not the external Chrome + CDP approach?", a: "Tried it; it works, but it forces two apps open at once. WorkBuddy's built-in browser exposes no CDP port, so this reads its session state instead — simpler, and no extra browser process." },
          { q: "Can it send messages to DeepSeek automatically?", a: "No, deliberately — programmatic sending is exactly where the ban risk comes from. For the reverse direction use <code>push</code>: it only puts the text on your clipboard; you paste and hit send yourself. Zero network requests." },
          { q: "Does it work on Windows?", a: "The script builds paths with <code>os.homedir()</code>, so it should be portable — but it has only been verified on macOS. Please validate the partition path yourself on Windows." },
          { q: "Can I install it without an agent?", a: "Sure. Clone the repo into your agent's skills directory — it's plain text plus scripts, with no build step." }
        ]
      },

      cta: { title: "Wire it up", desc: "Paste the prompt into your agent; hand off after the discussion in one line.", primary: "Open on GitHub", secondary: "Copy install prompt" },
      footer: { license: "MIT licensed", madeWith: "Built with iskill-promo-page" }
    }
  }
};
