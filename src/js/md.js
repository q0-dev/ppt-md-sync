// 极简 Markdown 解析 / 渲染 + 任务项操作。
// 只覆盖本项目用到的语法子集：标题、任务列表、普通列表、引用、代码、分隔线、行内格式。

import { splitLines } from "./diff.js";

const ESCAPE = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPE[ch]);
}

const TASK_RE = /^(\s*)[-*]\s+\[([ xX])\]\s*(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const UL_RE = /^\s*[-*]\s+/;
const OL_RE = /^\s*\d+[.)]\s+/;
const QUOTE_RE = /^\s*>\s?/;
const HR_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE_RE = /^\s*```/;
const STAMP_RE = /\s*\(\d{4}-\d{2}-\d{2} \d{2}:\d{2}\)\s*$/;

export function isTaskLine(line) {
  return TASK_RE.test(line);
}

export function taskInfo(line) {
  const m = String(line).match(TASK_RE);
  if (!m) return null;
  return { indent: m[1], done: m[2].toLowerCase() === "x", text: m[3] };
}

export function countTasks(src) {
  let total = 0;
  let done = 0;
  for (const line of splitLines(src)) {
    const info = taskInfo(line);
    if (info) {
      total++;
      if (info.done) done++;
    }
  }
  return { total, done };
}

export function fmtStamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

/** 行内格式：转义 → 链接 → 加粗/斜体/删除线 → 还原代码段。 */
export function inlineMd(raw) {
  const codes = [];
  let text = String(raw).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  text = escapeHtml(text);
  text = text.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (full, label, url) =>
    /^(https?:|mailto:)/i.test(url)
      ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`
      : label
  );
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(^|[^*\w])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  text = text.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  text = text.replace(/\u0000(\d+)\u0000/g, (_, index) => `<code>${escapeHtml(codes[Number(index)])}</code>`);
  return text;
}

function isBlockStart(line) {
  return (
    /^\s*$/.test(line) ||
    HEADING_RE.test(line) ||
    HR_RE.test(line) ||
    FENCE_RE.test(line) ||
    QUOTE_RE.test(line) ||
    isTaskLine(line) ||
    UL_RE.test(line) ||
    OL_RE.test(line)
  );
}

/**
 * 渲染 Markdown。
 * 任务项携带 data-line（源码行号），供预览中点击勾选。
 * @returns {{html:string, stats:{total:number, done:number}}}
 */
export function renderMarkdown(src) {
  const lines = splitLines(src);
  const out = [];
  const stats = { total: 0, done: 0 };
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) { i++; continue; }

    const heading = line.match(HEADING_RE);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inlineMd(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (HR_RE.test(line)) { out.push("<hr/>"); i++; continue; }

    if (FENCE_RE.test(line)) {
      const lang = line.replace(FENCE_RE, "").trim();
      const code = [];
      i++;
      while (i < lines.length && !FENCE_RE.test(lines[i])) { code.push(lines[i]); i++; }
      i++;
      out.push(
        `<pre class="md-code"><code${lang ? ` data-lang="${escapeHtml(lang)}"` : ""}>${escapeHtml(code.join("\n"))}</code></pre>`
      );
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const quote = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quote.push(lines[i].replace(QUOTE_RE, ""));
        i++;
      }
      out.push(`<blockquote>${quote.map(inlineMd).join("<br/>")}</blockquote>`);
      continue;
    }

    if (isTaskLine(line)) {
      const items = [];
      while (i < lines.length && isTaskLine(lines[i])) {
        const info = taskInfo(lines[i]);
        stats.total++;
        if (info.done) stats.done++;
        items.push(
          `<li class="md-task ${info.done ? "t-done" : "t-todo"}">` +
          `<label><input type="checkbox" data-line="${i}" ${info.done ? "checked" : ""}/>` +
          `<span class="task-text">${inlineMd(info.text)}</span></label></li>`
        );
        i++;
      }
      out.push(`<ul class="md-tasks">${items.join("")}</ul>`);
      continue;
    }

    if (UL_RE.test(line)) {
      const items = [];
      while (i < lines.length && UL_RE.test(lines[i]) && !isTaskLine(lines[i])) {
        items.push(`<li>${inlineMd(lines[i].replace(UL_RE, ""))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (OL_RE.test(line)) {
      const items = [];
      while (i < lines.length && OL_RE.test(lines[i])) {
        items.push(`<li>${inlineMd(lines[i].replace(OL_RE, ""))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    const paragraph = [];
    while (i < lines.length && !isBlockStart(lines[i])) { paragraph.push(lines[i]); i++; }
    out.push(`<p>${paragraph.map(inlineMd).join("<br/>")}</p>`);
  }

  return { html: out.join("\n"), stats };
}

/** 勾选/取消预览中的任务，返回新文本。 */
export function toggleTaskLine(src, lineIndex, { stamp = "" } = {}) {
  const lines = splitLines(src);
  const info = taskInfo(lines[lineIndex]);
  if (!info) return { src, changed: false };

  if (!info.done) {
    let text = info.text.trimEnd();
    if (stamp && !STAMP_RE.test(text)) text = `${text} (${stamp})`;
    lines[lineIndex] = `${info.indent}- [x] ${text}`;
  } else {
    const text = info.text.trimEnd().replace(STAMP_RE, "");
    lines[lineIndex] = `${info.indent}- [ ] ${text}`;
  }
  return { src: lines.join("\n"), changed: true };
}

/** 追加一条任务：优先放入同名小节（## 待办 / ## 已完成），否则在文末新建小节。 */
export function appendTask(src, text, { done = false, stamp = "" } = {}) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (!clean) return src;

  const lines = splitLines(src);
  const item = `- [${done ? "x" : " "}] ${clean}${done && stamp ? ` (${stamp})` : ""}`;
  const sectionName = done ? "已完成" : "待办";
  const headingIndex = lines.findIndex((line) => {
    const m = line.match(/^#{1,6}\s+(.*?)\s*$/);
    return m && m[1].trim() === sectionName;
  });

  if (headingIndex === -1) {
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    if (lines.length) lines.push("");
    lines.push(`## ${sectionName}`, item);
    return lines.join("\n");
  }

  let end = lines.length;
  for (let i = headingIndex + 1; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i])) { end = i; break; }
  }
  while (end > headingIndex + 1 && lines[end - 1].trim() === "") end--;
  lines.splice(end, 0, item);
  return lines.join("\n");
}

/** 以引用块形式追加一段文字（用于“引用文档选中文本”）。 */
export function appendQuote(src, text) {
  const quote = String(text)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!quote.length) return src;
  const base = String(src).replace(/\s+$/, "");
  return `${base}${base ? "\n\n" : ""}> ${quote.join("\n> ")}\n`;
}

export function defaultTemplate() {
  return [
    "# 待办与记录",
    "",
    "## 待办",
    "- [ ] 示例：写下你的第一件事，然后在下方点“记录版本”",
    "",
    "## 已完成",
    "",
  ].join("\n");
}
