#!/usr/bin/env node
// 开发服务器：用 office-addin-dev-certs 的受信任证书提供 https://localhost:3000，
// 供 Office 加载 manifest.xml 里指向的页面。用法：npm start（npm run debug 会自动启动它）

import { createServer } from "node:https";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.env.PORT || 3000);

// 旧目录结构的页面路径（已附加的文档里可能还引用着它们）重定向到新位置。
const LEGACY_REDIRECTS = new Map([
  ["/src/taskpane.html", "/src/taskpane/taskpane.html"],
  ["/src/commands.html", "/src/commands/commands.html"],
]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    let pathname = decodeURIComponent(url.pathname);
    const legacy = LEGACY_REDIRECTS.get(pathname);
    if (legacy) {
      res.writeHead(302, { Location: legacy }).end();
      return;
    }
    if (pathname.endsWith("/")) pathname += "index.html";
    const filePath = normalize(join(ROOT, pathname));
    if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" }).end("403 Forbidden");
      return;
    }
    const data = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end(`404 Not Found: ${req.url}`);
  }
}

const { getHttpsServerOptions } = await import("office-addin-dev-certs");
let serverOptions;
try {
  serverOptions = await getHttpsServerOptions();
} catch (err) {
  console.error("无法准备本地开发证书（office-addin-dev-certs），请先运行 npm install。");
  console.error(err.message ?? err);
  process.exit(1);
}

createServer(serverOptions, handler).listen(PORT, () => {
  console.log("\n  MD 待办 · 版本记录 — 开发服务器");
  console.log(`  https://localhost:${PORT}/src/taskpane/taskpane.html`);
});
