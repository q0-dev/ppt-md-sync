// 轻量版本仓库：线性快照 + 内容指纹，参考 git 的极简子集，不引入对象库/分支等概念。

import { diffLines, diffStats } from "./diff.js";
import { countTasks } from "./md.js";

export const STORE_KEY = "md-note-sync.store.v1";
export const PREFS_KEY = "md-note-sync.prefs.v1";
export const MAX_VERSIONS = 300;

/** FNV-1a 32 位哈希。 */
export function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** 短指纹，用于展示（类似 git short hash）。 */
export function shortHash(text, length = 7) {
  const a = fnv1a(text);
  const b = fnv1a(`${text.length}#${text}`);
  return (a.toString(36) + b.toString(36)).padStart(10, "0").slice(0, length);
}

export function createStore(draft = "") {
  const now = Date.now();
  return { format: 1, createdAt: now, updatedAt: now, draft: String(draft), versions: [] };
}

export function headVersion(store) {
  return store.versions.length ? store.versions[store.versions.length - 1] : null;
}

/** 兼容旧数据 / 脏数据的最小归一化。 */
export function normalizeStore(raw) {
  if (!raw || typeof raw !== "object") return null;
  const versions = Array.isArray(raw.versions)
    ? raw.versions
        .filter((v) => v && typeof v.content === "string")
        .map((v, index) => ({
          n: Number.isFinite(v.n) ? v.n : index + 1,
          hash: typeof v.hash === "string" ? v.hash : shortHash(v.content),
          parent: Number.isFinite(v.parent) ? v.parent : null,
          t: Number.isFinite(v.t) ? v.t : Date.now(),
          msg: typeof v.msg === "string" && v.msg.trim() ? v.msg.trim() : "更新",
          ctx: typeof v.ctx === "string" && v.ctx.trim() ? v.ctx : null,
          content: String(v.content).replace(/\r\n?/g, "\n"),
        }))
    : [];
  return {
    format: 1,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
    draft: typeof raw.draft === "string" ? raw.draft : "",
    versions,
  };
}

/**
 * 追加一个版本（快照）。历史保持线性，超出上限时裁剪最旧记录。
 * @returns {object} 新版本对象
 */
export function addVersion(store, { msg = "", content, ctx = "" } = {}) {
  const head = headVersion(store);
  const normalized = String(content ?? "").replace(/\r\n?/g, "\n");
  const { total, done } = countTasks(normalized);
  const version = {
    n: (head ? head.n : 0) + 1,
    hash: shortHash(normalized),
    parent: head ? head.n : null,
    t: Date.now(),
    msg: String(msg).trim() || `更新 · ${done}/${total} 完成`,
    ctx: String(ctx).trim() || null,
    content: normalized,
    stat: diffStats(head ? head.content : "", normalized),
  };
  store.versions.push(version);
  if (store.versions.length > MAX_VERSIONS) {
    store.versions.splice(0, store.versions.length - MAX_VERSIONS);
  }
  store.draft = normalized;
  store.updatedAt = Date.now();
  return version;
}

export function findVersion(store, n) {
  return store.versions.find((v) => v.n === n) || null;
}

export function fmtDateTime(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

export function fmtShortTime(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

function diffOpLine(op) {
  if (op.type === "add") return `+ ${op.text}`;
  if (op.type === "del") return `- ${op.text}`;
  return `  ${op.text}`;
}

/** 导出完整历史为一份 Markdown（含每步 diff 与当前清单）。 */
export function exportHistoryMd(store, { title = "待办与记录" } = {}) {
  const lines = [];
  lines.push(`# ${title} · 变更历史`, "");
  lines.push(`> 生成时间：${fmtDateTime(new Date())}`, `> 版本数：${store.versions.length}`, "");

  if (!store.versions.length) {
    lines.push("暂无版本记录。", "");
  }

  for (const version of store.versions) {
    const parent = version.parent == null ? null : findVersion(store, version.parent);
    lines.push(`## #${version.n} · ${fmtDateTime(new Date(version.t))} · ${version.msg}`, "");
    lines.push(
      `- 指纹：\`${version.hash}\``,
      `- 变更：${version.stat ? `+${version.stat.add} / −${version.stat.del}` : "+0 / −0"}`,
      ""
    );
    if (version.ctx) {
      lines.push("### 上下文", "", ...version.ctx.split("\n").map((line) => `> ${line}`), "");
    }
    const diff = diffLines(parent ? parent.content : "", version.content);
    lines.push("```diff", ...diff.ops.map(diffOpLine), "```", "");
  }

  lines.push("## 当前清单", "", "```markdown", store.draft, "```", "");
  return lines.join("\n");
}

export function exportCurrentMd(store) {
  return store.draft.endsWith("\n") ? store.draft : `${store.draft}\n`;
}

export function storeBytes(store) {
  return new TextEncoder().encode(JSON.stringify(store)).length;
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
