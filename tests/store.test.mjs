import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_VERSIONS,
  addVersion,
  createStore,
  exportCurrentMd,
  exportHistoryMd,
  findVersion,
  fnv1a,
  formatBytes,
  headVersion,
  normalizeStore,
  shortHash,
  storeBytes,
} from "../src/js/store.js";

test("短指纹稳定且长度可控", () => {
  assert.equal(fnv1a("abc"), fnv1a("abc"));
  assert.notEqual(fnv1a("abc"), fnv1a("abd"));
  assert.equal(shortHash("内容").length, 7);
  assert.equal(shortHash("内容", 10).length, 10);
});

test("addVersion 生成线性快照并统计增删", () => {
  const store = createStore("# A\n- [ ] 任务1");
  const v1 = addVersion(store, { content: "# A\n- [ ] 任务1", msg: "" });
  assert.equal(v1.n, 1);
  assert.equal(v1.parent, null);
  assert.deepEqual(v1.stat, { add: 2, del: 0 });
  assert.equal(v1.msg, "更新 · 0/1 完成");
  assert.equal(store.draft, "# A\n- [ ] 任务1");

  const v2 = addVersion(store, { content: "# A\n- [x] 任务1", msg: "完成第一项", ctx: "选中文本" });
  assert.equal(v2.n, 2);
  assert.equal(v2.parent, 1);
  assert.deepEqual(v2.stat, { add: 1, del: 1 });
  assert.equal(v2.ctx, "选中文本");
  assert.equal(headVersion(store).n, 2);
});

test("历史超过上限时裁剪最旧版本", () => {
  const store = createStore();
  for (let i = 0; i < MAX_VERSIONS + 5; i++) addVersion(store, { content: `第 ${i} 版` });
  assert.equal(store.versions.length, MAX_VERSIONS);
  assert.equal(store.versions[0].n, 6);
});

test("exportHistoryMd / exportCurrentMd 输出可读 Markdown", () => {
  const store = createStore();
  addVersion(store, { content: "# A\n- [ ] 任务1", msg: "初始" });
  addVersion(store, { content: "# A\n- [x] 任务1", msg: "完成第一项", ctx: "选中文本" });
  const log = exportHistoryMd(store);
  assert.ok(log.includes("## #1 · "));
  assert.ok(log.includes("完成第一项"));
  assert.ok(log.includes("> 选中文本"));
  assert.ok(log.includes("```diff"));
  assert.ok(log.includes("## 当前清单"));
  assert.ok(exportCurrentMd(store).endsWith("\n"));
});

test("normalizeStore 容错脏数据", () => {
  assert.equal(normalizeStore(null), null);
  assert.equal(normalizeStore("junk"), null);
  const normalized = normalizeStore({ draft: "x", versions: [{ content: "y" }, null, { n: 5 }] });
  assert.equal(normalized.versions.length, 1);
  assert.equal(normalized.versions[0].n, 1);
  assert.equal(normalized.versions[0].msg, "更新");
  assert.equal(normalized.draft, "x");
  assert.equal(normalizeStore({ versions: [{ content: "a\r\nb" }] }).versions[0].content, "a\nb");
});

test("存储体积估算与格式化", () => {
  const store = createStore("abc");
  assert.ok(storeBytes(store) > 0);
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(formatBytes(3 * 1024 * 1024), "3.00 MB");
  assert.equal(findVersion(store, 1), null);
});
