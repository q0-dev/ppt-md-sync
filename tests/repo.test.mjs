// 仓库一致性检查：HTML 引用的 id、脚本/样式文件、manifest 中的 URL 都必须真实存在。
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const exists = (p) => existsSync(new URL(p, import.meta.url));

test("app.js 通过 $() 引用的 id 都存在于 taskpane.html", () => {
  const html = read("../src/taskpane.html");
  const js = read("../src/js/app.js");
  const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const jsIds = [...js.matchAll(/\$\("([^"]+)"\)/g)].map((m) => m[1]);
  const missing = [...new Set(jsIds.filter((id) => !htmlIds.has(id)))];
  assert.deepEqual(missing, [], `缺失的 id: ${missing.join(", ")}`);
  assert.ok(jsIds.length > 0);
});

test("taskpane.html 引用的脚本与样式文件存在", () => {
  const html = read("../src/taskpane.html");
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const url = m[1];
    if (/^(https?:|data:|#)/.test(url)) continue;
    assert.ok(exists(`../src/${url}`), `文件缺失: ${url}`);
  }
});

test("manifest.xml 的开发期 URL 都指向真实文件", () => {
  const manifest = read("../manifest.xml");
  const urls = [...manifest.matchAll(/https:\/\/localhost:3000\/([^"<>\s]+)/g)].map((m) => m[1]);
  assert.ok(urls.length >= 6);
  for (const path of urls) {
    assert.ok(exists(`../${path}`), `manifest 引用的文件缺失: ${path}`);
  }
  assert.ok(manifest.includes("https://localhost:3000/README.md"));
});

test("package.json 元数据与脚本完整", () => {
  const pkg = JSON.parse(read("../package.json"));
  assert.equal(pkg.type, "module");
  assert.ok(pkg.license);
  assert.ok(pkg.engines?.node);
  for (const script of ["start", "debug", "debug:word", "debug:excel", "register", "unregister", "test", "validate"]) {
    assert.ok(pkg.scripts[script], `缺少 npm script: ${script}`);
  }
  assert.equal(pkg.config.app_to_debug, "powerpoint");
});

test("README 与 LICENSE 存在", () => {
  assert.ok(exists("../README.md"));
  assert.ok(exists("../LICENSE"));
});
