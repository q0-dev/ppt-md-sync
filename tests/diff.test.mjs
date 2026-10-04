import { test } from "node:test";
import assert from "node:assert/strict";
import { diffLines, diffStats, splitLines } from "../src/js/diff.js";

test("splitLines 处理空文本、尾换行与空行", () => {
  assert.deepEqual(splitLines(""), []);
  assert.deepEqual(splitLines("a\nb\n"), ["a", "b"]);
  assert.deepEqual(splitLines("a\n\n"), ["a", ""]);
});

test("diffLines 标记增删并保留相同行", () => {
  const d = diffLines("a\nb\nc", "a\nx\nc");
  assert.equal(d.add, 1);
  assert.equal(d.del, 1);
  assert.deepEqual(d.ops.map((op) => op.type), ["eq", "del", "add", "eq"]);
  assert.deepEqual(d.ops.map((op) => op.text), ["a", "b", "x", "c"]);
});

test("diffStats 覆盖无变化与纯新增", () => {
  assert.deepEqual(diffStats("same", "same"), { add: 0, del: 0 });
  assert.deepEqual(diffStats("", "x"), { add: 1, del: 0 });
  assert.deepEqual(diffStats("x", ""), { add: 0, del: 1 });
});
