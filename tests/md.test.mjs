import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendQuote,
  appendTask,
  countTasks,
  defaultTemplate,
  escapeHtml,
  inlineMd,
  renderMarkdown,
  taskInfo,
  toggleTaskLine,
} from "../src/js/md.js";

const SRC = "# 标题\n\n## 待办\n- [ ] 事项A\n- [x] 事项B\n\n## 已完成\n";

test("renderMarkdown 统计任务并输出 data-line 行号", () => {
  const { html, stats } = renderMarkdown(SRC);
  assert.deepEqual(stats, { total: 2, done: 1 });
  assert.ok(html.includes('data-line="3"'));
  assert.ok(html.includes('class="md-task t-done"'));
  assert.ok(html.includes('class="md-task t-todo"'));
  assert.ok(html.includes("<h2>待办</h2>"));
  assert.ok(html.includes("<h1>标题</h1>"));
});

test("renderMarkdown 转义 HTML 并支持代码围栏", () => {
  const { html } = renderMarkdown("```js\nconst a = 1 < 2;\n```");
  assert.ok(html.includes("&lt;"));
  assert.ok(!html.includes("<script"));
});

test("inlineMd 支持行内代码、粗体与安全链接", () => {
  assert.ok(inlineMd("**粗**").includes("<strong>粗</strong>"));
  assert.ok(inlineMd("`a < b`").includes("<code>a &lt; b</code>"));
  assert.ok(inlineMd("[x](https://example.com)").includes('href="https://example.com"'));
  assert.ok(!inlineMd("[x](javascript:alert(1))").includes("href"));
});

test("toggleTaskLine 勾选时附时间戳，取消时移除", () => {
  const toggled = toggleTaskLine(SRC, 3, { stamp: "2026-10-04 22:00" });
  assert.ok(toggled.changed);
  assert.ok(toggled.src.includes("- [x] 事项A (2026-10-04 22:00)"));
  const untoggled = toggleTaskLine(toggled.src, 3, {});
  assert.ok(untoggled.src.includes("- [ ] 事项A\n"));
  assert.equal(toggleTaskLine(SRC, 0, {}).changed, false);
});

test("appendTask 插入到同名小节，缺失时自动新建", () => {
  const todo = appendTask(SRC, "  新   待办 ", {});
  assert.ok(todo.includes("- [ ] 新 待办"));
  assert.ok(todo.indexOf("- [ ] 新 待办") > todo.indexOf("## 待办"));
  assert.ok(todo.indexOf("- [ ] 新 待办") < todo.indexOf("## 已完成"));

  const done = appendTask(SRC, "完成了一件事", { done: true, stamp: "2026-10-04 22:00" });
  assert.ok(done.includes("- [x] 完成了一件事 (2026-10-04 22:00)"));
  assert.ok(done.indexOf("- [x] 完成了一件事") > done.indexOf("## 已完成"));

  const noSection = appendTask("# 只有标题\n", "没有小节", {});
  assert.ok(noSection.includes("## 待办\n- [ ] 没有小节"));

  assert.equal(appendTask(SRC, "   "), SRC);
});

test("appendQuote 生成引用块", () => {
  assert.equal(appendQuote("abc", "第一行\n第二行"), "abc\n\n> 第一行\n> 第二行\n");
  assert.equal(appendQuote("", "  "), "");
});

test("taskInfo / countTasks / defaultTemplate / escapeHtml", () => {
  assert.deepEqual(taskInfo("- [x] 搞定"), { indent: "", done: true, text: "搞定" });
  assert.equal(taskInfo("普通行"), null);
  assert.deepEqual(countTasks(defaultTemplate()), { total: 1, done: 0 });
  assert.equal(escapeHtml('<a "b">'), "&lt;a &quot;b&quot;&gt;");
});
