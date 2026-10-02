#!/usr/bin/env node
/**
 * ds-sync.mjs — 把 WorkBuddy 内置浏览器里的 DeepSeek 对话读出来，交给 agent。
 *
 * 为什么需要它：
 *   WorkBuddy 的内置浏览器面板是 Electron webview，**没有暴露 CDP 调试端口**，
 *   所以无法像外部 Chrome 那样用 agent-browser 去驱动它。
 *   但它的 Chromium 分区（含 localStorage）是落在磁盘上的，其中 userToken 就是
 *   DeepSeek 的登录凭证。拿到 token 后，用**只读 GET 接口**把对话拉回来 ——
 *   不需要 Chrome，不需要在两个应用之间切换。
 *
 * 风险边界（重要）：
 *   本工具只调用 GET 只读接口（列会话 / 取历史消息），
 *   不调用 /chat/completion、不做 PoW、不做 prompt 注入、不高频轮询。
 *   真正的「生成」始终发生在真实浏览器里，因此与「把网页版封装成 API」的封号风险
 *   不是一个量级。但仍属非浏览器 HTTP 客户端，请保持低频、按需调用。
 *
 * 用法：
 *   node ds-sync.mjs status                     查看登录状态 / 定位分区
 *   node ds-sync.mjs list [--count 20]          列出最近会话
 *   node ds-sync.mjs pull --latest [--think]    导出最近一次会话为 markdown
 *   node ds-sync.mjs pull --title 关键字        按标题模糊匹配
 *   node ds-sync.mjs pull --id <session_id>
 *   node ds-sync.mjs pull --index 2             list 里的序号（1 起）
 *   node ds-sync.mjs partitions                 列出所有分区及其 token 情况
 *
 * 选项：
 *   --think          包含模型思考过程（THINK，可能很长）
 *   --tail N         只取最后 N 条消息
 *   --out <path>     写入文件（默认打印到 stdout）
 *   --raw            输出原始 JSON（调试用）
 *   --json           机器可读输出
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HOME = os.homedir();
const PARTITIONS_ROOT = path.join(HOME, ".workbuddy-ai", "app", "session", "Partitions");
const API_BASE = "https://chat.deepseek.com";

const HEADERS_BASE = {
  "x-app-version": "20241129.1",
  "x-client-platform": "web",
  "x-client-version": "1.0.0-always",
  "x-client-locale": "zh_CN",
  "accept": "*/*",
  "referer": "https://chat.deepseek.com/",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
};

// ---------------------------------------------------------------- CLI parsing

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--latest") out.latest = true;
    else if (a === "--think") out.think = true;
    else if (a === "--raw") out.raw = true;
    else if (a === "--json") out.json = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--count" || a === "--tail" || a === "--out" || a === "--id" || a === "--title" || a === "--index") {
      out[a.slice(2)] = argv[++i];
    } else if (a.startsWith("--")) {
      out[a.slice(2)] = true;
    } else out._.push(a);
  }
  return out;
}

// -------------------------------------------------------- partition discovery

function listPartitions() {
  if (!fs.existsSync(PARTITIONS_ROOT)) return [];
  return fs
    .readdirSync(PARTITIONS_ROOT)
    .map((n) => path.join(PARTITIONS_ROOT, n))
    .filter((p) => {
      try {
        return fs.statSync(p).isDirectory();
      } catch {
        return false;
      }
    });
}

function leveldbOf(partDir) {
  return path.join(partDir, "Local Storage", "leveldb");
}

/** 从 leveldb 里抠出 userToken 的 JSON，返回 {raw, value} 或 null */
function extractTokenFromLeveldb(dir) {
  let files;
  try {
    files = fs
      .readdirSync(dir)
      .filter((f) => /\.(ldb|log)$/i.test(f))
      .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => a.t - b.t) // 旧 -> 新，最后一次写入在最后
      .map((x) => x.f);
  } catch {
    return null;
  }

  let buf = Buffer.alloc(0);
  for (const f of files) {
    try {
      buf = Buffer.concat([buf, fs.readFileSync(path.join(dir, f))]);
    } catch {
      /* ignore */
    }
  }
  const s = buf.toString("utf8");

  const positions = [];
  let from = 0;
  while (true) {
    const i = s.indexOf("userToken", from);
    if (i < 0) break;
    positions.push(i);
    from = i + 1;
  }

  // 从后往前找第一个可解析且 value 非空的
  let fallback = null;
  for (let k = positions.length - 1; k >= 0; k--) {
    const start = s.indexOf("{", positions[k]);
    if (start < 0) continue;
    let depth = 0,
      end = -1;
    for (let i = start; i < s.length; i++) {
      const c = s[i];
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) continue;
    const raw = s.slice(start, end + 1);
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!("value" in obj)) continue;
    const value = typeof obj.value === "string" ? obj.value : null;
    if (value) return { raw, value, dir };
    if (!fallback) fallback = { raw, value: null, dir };
  }
  return fallback;
}

/** 扫描所有分区，挑出「有有效 token 且 leveldb 最新」的那个 */
function resolveSession() {
  const all = listPartitions().map((p) => {
    const dir = leveldbOf(p);
    let mtime = 0;
    try {
      mtime = fs.statSync(dir).mtimeMs;
    } catch {
      /* ignore */
    }
    return { partition: path.basename(p), dir, mtime, token: extractTokenFromLeveldb(dir) };
  });

  const withToken = all.filter((x) => x.token && x.token.value);
  withToken.sort((a, b) => b.mtime - a.mtime);
  return { chosen: withToken[0] || null, all };
}

// ------------------------------------------------------------------ transport

async function apiGet(p, token) {
  const url = API_BASE + p;
  const res = await fetch(url, {
    method: "GET",
    headers: { ...HEADERS_BASE, authorization: "Bearer " + token },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, text, json };
}

function bizData(resp) {
  const d = resp && resp.json && resp.json.data;
  return (d && d.biz_data) || null;
}

// ------------------------------------------------------------------ rendering

function fmtTime(sec) {
  if (!sec) return "";
  const d = new Date(sec * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function renderSession(session, messages, opts = {}) {
  const total = opts.total || messages.length;
  const countLine =
    total > messages.length ? `共 ${total} 条，此处为最后 ${messages.length} 条` : `${total} 条`;
  const lines = [];
  lines.push(`# ${session.title || "（无标题会话）"}`);
  lines.push("");
  lines.push("> 来源：WorkBuddy 内置浏览器 · DeepSeek 网页版");
  lines.push(`> 会话 ID：\`${session.id}\``);
  if (session.updated_at) lines.push(`> 最后更新：${fmtTime(session.updated_at)}`);
  lines.push(`> 消息数：${countLine}${opts.think ? "（含思考过程）" : "（已省略思考过程，加 --think 可包含）"}`);
  lines.push(`> 导出时间：${new Date().toISOString()}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const m of messages) {
    const role = m.role === "USER" ? "我" : "DeepSeek";
    lines.push(`## ${role}`);
    lines.push("");
    for (const f of m.fragments || []) {
      const content = (f.content || "").trim();
      if (!content) continue;
      if (f.type === "THINK") {
        if (!opts.think) continue;
        lines.push(`<details><summary>思考过程（${content.length} 字）</summary>`);
        lines.push("");
        lines.push(content);
        lines.push("");
        lines.push("</details>");
        lines.push("");
      } else if (f.type === "REQUEST" || f.type === "RESPONSE") {
        lines.push(content);
        lines.push("");
      } else {
        // 未知类型，原样保留，避免丢内容
        lines.push(`<!-- fragment type=${f.type} -->`);
        lines.push(content);
        lines.push("");
      }
    }
  }
  return lines.join("\n");
}

// --------------------------------------------------------------------- main

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] || "help";

  if (args.help || cmd === "help") {
    console.log(
      [
        "ds-sync — 读取 WorkBuddy 内置浏览器里的 DeepSeek 对话",
        "",
        "  status                  查看登录状态 / 定位分区",
        "  partitions              列出所有分区及其 token 情况",
        "  list [--count 20]       列出最近会话",
        "  pull --latest           导出最近一次会话（markdown）",
        "  pull --title <关键字>    按标题模糊匹配",
        "  pull --id <session_id>  按 ID",
        "  pull --index <n>        按 list 序号（1 起）",
        "",
        "选项：--think  --tail N  --out <path>  --raw  --json",
      ].join("\n")
    );
    return;
  }

  const { chosen, all } = resolveSession();

  if (cmd === "partitions") {
    for (const p of all) {
      const st = p.token ? (p.token.value ? "已登录 (token " + p.token.value.length + " 字符)" : "未登录 (value=null)") : "无 userToken";
      const m = p.mtime ? new Date(p.mtime).toISOString() : "-";
      console.log(`${p.partition.padEnd(64)} ${st.padEnd(28)} mtime=${m}`);
    }
    return;
  }

  if (!chosen) {
    console.error("× 没找到任何已登录的 DeepSeek 会话。");
    console.error("  请先在 WorkBuddy 内置浏览器面板打开 https://chat.deepseek.com/ 并登录。");
    process.exitCode = 3;
    return;
  }

  const token = chosen.token.value;

  if (cmd === "status") {
    const r = await apiGet("/api/v0/users/current", token);
    if (r.status !== 200 || !r.json || r.json.code !== 0) {
      console.log("分区    : " + chosen.partition);
      console.log("token   : " + token.slice(0, 8) + "..." + token.slice(-6) + " (" + token.length + " 字符)");
      console.log("接口验证: 失败 (HTTP " + r.status + ") — token 可能已失效，请在面板重新登录");
      process.exitCode = 4;
      return;
    }
    const u = bizData(r) || {};
    const prof = (u.id_profile) || {};
    console.log("分区      : " + chosen.partition);
    console.log("接口验证  : OK");
    console.log("账号      : " + (prof.name || "(无名)"));
    console.log("登录方式  : " + (prof.provider || "?"));
    console.log("手机号    : " + (u.mobile_number || "-"));
    console.log("用户 ID   : " + (u.id || "-"));
    console.log("token     : " + token.slice(0, 8) + "..." + token.slice(-6) + " (" + token.length + " 字符)");
    return;
  }

  if (cmd === "list") {
    const count = Number(args.count || 20);
    const r = await apiGet("/api/v0/chat_session/fetch_page?count=" + count, token);
    const bd = bizData(r);
    const sessions = (bd && bd.chat_sessions) || [];
    if (!sessions.length) {
      console.error("× 拉取会话列表失败或为空 (HTTP " + r.status + ")");
      process.exitCode = 5;
      return;
    }
    if (args.json) {
      console.log(JSON.stringify(sessions, null, 2));
      return;
    }
    sessions.forEach((s, i) => {
      console.log(`${String(i + 1).padStart(2)}. ${fmtTime(s.updated_at)}  ${s.title || "(无标题)"}   [${s.id}]`);
    });
    return;
  }

  if (cmd === "pull") {
    let session = null;

    if (args.id) {
      session = { id: args.id, title: "(指定 ID)" };
    } else {
      const r = await apiGet("/api/v0/chat_session/fetch_page?count=50", token);
      const bd = bizData(r);
      const sessions = (bd && bd.chat_sessions) || [];
      if (!sessions.length) {
        console.error("× 拉取会话列表失败 (HTTP " + r.status + ")");
        process.exitCode = 5;
        return;
      }
      if (args.title) {
        session = sessions.find((s) => (s.title || "").includes(args.title));
        if (!session) {
          console.error("× 没找到标题包含「" + args.title + "」的会话。可用会话：");
          sessions.slice(0, 20).forEach((s, i) => console.error(`  ${i + 1}. ${s.title}`));
          process.exitCode = 6;
          return;
        }
      } else if (args.index) {
        session = sessions[Number(args.index) - 1];
        if (!session) {
          console.error("× 序号超出范围（共 " + sessions.length + " 个）");
          process.exitCode = 6;
          return;
        }
      } else {
        // 默认 & --latest
        session = sessions[0];
      }
    }

    const hr = await apiGet("/api/v0/chat/history_messages?chat_session_id=" + session.id, token);
    const hbd = bizData(hr);
    let messages = (hbd && hbd.chat_messages) || [];
    if (!messages.length) {
      console.error("× 该会话没有消息，或拉取失败 (HTTP " + hr.status + ")");
      process.exitCode = 7;
      return;
    }

    if (args.raw) {
      console.log(JSON.stringify(messages, null, 2));
      return;
    }

    const total = messages.length;
    if (args.tail) {
      const n = Number(args.tail);
      if (n > 0) messages = messages.slice(-n);
    }

    const md = renderSession(session, messages, { think: !!args.think, total });

    const note =
      args.tail && Number(args.tail) < total
        ? `（原始 ${total} 条，已截取最后 ${messages.length} 条）`
        : "";

    if (args.out) {
      const outPath = path.resolve(args.out);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, md, "utf8");
      console.log("已导出 " + messages.length + " 条消息 " + note + " -> " + outPath);
    } else {
      console.log(md);
    }
    return;
  }

  console.error("未知命令：" + cmd + "（用 --help 查看用法）");
  process.exitCode = 2;
}

main().catch((e) => {
  console.error("× 运行出错：" + (e && e.message ? e.message : String(e)));
  process.exitCode = 1;
});
