# MD 待办 · 版本记录

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)

一个轻量的 Microsoft Office 任务窗格加载项（Word / Excel / PowerPoint）：**用 Markdown 随手记待办与完成事项，用「记录版本」保存快照**——可以对比差异、恢复历史，但没有分支、暂存区、远程仓库之类的负担，像是一个只保留"提交"的极简 git。

> 改完笔记点一下「记录版本 (Ctrl+Enter)」，就多一个带短指纹的线性快照；点开历史能看每一步的 +/- diff，也能一键恢复为草稿。

## 功能

- **随手记**：顶部输入框回车即添加待办，`Ctrl+Enter` 添加为已完成（可自动附时间戳）。
- **Markdown 编辑 / 预览**：预览模式下点勾选框直接完成任务，源文本自动同步。
- **轻量版本控制**：每个「记录版本」＝ 全量快照 + 短指纹（7 位）+ 增删行统计；历史线性、可看相邻版本 diff、可恢复任意版本为草稿。
- **Office 集成**：一键「引用」文档中选中的文字；「写入」把当前清单写入文档选区；提交时可附上一段文档上下文。
- **数据可控**：默认随文档保存（跟着文件走），可切换本机浏览器存储；支持导出 / 导入 `.md`，最多保留 300 个版本。

## 快速开始（Windows + 桌面版 Office）

前置：Windows 上装有桌面版 Word / Excel / PowerPoint（Microsoft 365 或 Office 2016+，建议新版），Node.js ≥ 20。

```bash
npm install                  # 首次
npm run debug                # 启动本地服务 + 注册加载项 + 打开 PowerPoint
npm run register             # 只注册加载项、不打开应用：让插件常驻在每个 PPT 里
npm run unregister           # 取消注册（插件从 Office 中消失）
npm run debug:word           # 需要调试 Word 时
npm run debug:excel          # 需要调试 Excel 时
npm run debug:stop           # 结束调试并清理注册
```

上述命令只能在 Windows 上运行（需要写注册表并启动 Office）；WSL 里只能写代码、跑 `npm test`。只想单独起本地服务：`npm start` 或双击 `scripts/start-server.vbs`。

### 让任意 PPT 都能用上插件

1. 在 Windows 终端跑一次 `npm run register`（跑过一次 `npm run debug` 也会注册）：插件写入注册表后**常驻**，之后每个 PPT 的「开始」选项卡里都有「MD 记录」按钮，点一下即可打开面板。插件哪天消失（例如执行过 `npm run debug:stop`），重跑 `npm run register` 并重启 Office 即可。
   - 找不到按钮时看「开始」选项卡，不要在「插入 → 获取加载项 / 我的加载项」里找——开发中的插件不会出现在商店入口。
2. 自动展开是**按文件生效**的：第一次在某个 PPT 里打开面板时，插件会为该文件自动开启「打开此文件时自动展开面板」；**保存这个 PPT** 后，下次打开该文件面板就会自动出现（可在设置里关闭）。
   - 任何 sideload 的加载项都做不到"所有 PPT 一律自动弹面板"——Office 的自动展开标记只认写在文件里的设置；能全局生效的只有管理员在 Microsoft 365 管理中心集中部署的事件激活，而那类代码又被限制为不能弹出 UI。因此本插件的策略是：**注册一次、处处可用；常用文件自动展开**。
3. 面板内容依赖本地服务常开（否则按钮在、面板打不开）：双击 `scripts/start-server.vbs` 可后台无窗口启动；把它放进 Windows「启动」文件夹（`Win+R` 输入 `shell:startup`）即可开机自启。

### 「插入 → 获取加载项」里找不到它？

开发期的加载项不走「获取加载项」商店入口，`npm run register` / `npm run debug` 会直接把它注册到 Office，按钮出现在「开始」选项卡的「MD 记录」组里。若你的 Office 版本里连「获取加载项」按钮本身都没有（部分 Office 2016 / 本地化版本），也属正常——本项目的装载方式不依赖它。

## 使用

| 操作 | 方式 |
| --- | --- |
| 添加待办 | 顶部输入框回车 |
| 添加已完成 | 顶部输入框 `Ctrl+Enter`，或点「✓完成」 |
| 记录版本 | `Ctrl+Enter` / `Ctrl+S`，或底部「记录版本」 |
| 加粗 | 编辑区 `Ctrl+B` |
| 完成任务 | 预览模式下点勾选框（勾选时自动附时间戳，可在设置里关闭） |
| 查看 diff / 恢复 | 「历史」标签 → 点某个版本 |

## 数据与存储

- **自动（推荐）**：优先把草稿与历史写进文档自定义设置，随文件保存，换电脑打开文件也在；不支持时退回本机浏览器存储。
- **仅文档内 / 仅浏览器**：可在设置面板固定。
- 每个文档最多 300 个版本，超出后裁剪最旧的；快照为全量文本，普通笔记量级只有几 KB。
- 设置面板可导出当前清单、导出完整历史、导入 `.md` 为草稿。

## 开发

```bash
npm test          # 单元测试（Node 内置 test runner，无需联网）
npm run validate  # 用微软官方服务校验 manifest.xml（需要联网）
```

改完代码后，在 Office 里重新打开任务窗格（或右键「重新加载」）即可看到最新版；改 `manifest.xml` 后需要重启 Office（必要时重跑一次 `npm run register`）。

### 目录结构

```
manifest.xml            # 三合一加载项清单（URL 指向本地服务）
src/taskpane.html       # 任务窗格页面
src/commands.html       # 功能命令页
src/css/taskpane.css    # 样式（含深色模式）
src/js/app.js           # 主程序：界面、快捷键、提交流程
src/js/md.js            # 极简 Markdown 渲染 + 任务操作
src/js/store.js         # 线性版本仓库：快照、短指纹、导出
src/js/diff.js          # 行级 diff（LCS）
src/js/office.js        # Office 适配层（宿主探测、选中读写、文档存储）
scripts/serve.mjs       # 本地 HTTPS 服务（office-addin-dev-certs 证书）
scripts/start-server.vbs# 后台启动服务的脚本（可用于开机自启）
tests/                  # node:test 单元测试
```

### 在 WSL 里开发

可以在 WSL 里写代码、跑 `npm test`，但 **Office 只能装载 Windows 侧的加载项**：把项目放到 Windows 盘（例如 `D:\QL\ppt-md`），在 Windows 终端里执行 `npm install` 与 `npm run register`（或 `npm run debug`）。WSL 改完代码后同步到该目录即可，无需重装依赖。

## 常见问题

- **任务窗格打不开 / 一直转圈**：本地服务没在跑。执行 `npm start` 或双击 `scripts/start-server.vbs`。
- **打开别的 PPT 找不到插件**：在 Windows 终端执行 `npm run register`，然后完全退出并重启 PowerPoint。插件在「开始」选项卡的「MD 记录」组；注册时 PowerPoint 如果开着，必须重启才能看到。也确认没有执行过 `npm run debug:stop`（它会注销插件）。
- **保存过文件，下次打开仍不自动展开面板**：勾选设置里的「打开此文件时自动展开面板」，保存文件后再重开；注意该开关按文件生效，换一个 PPT 需要重新打开一次面板并保存。
- **面板提示证书不受信任**：首次运行 `npm run debug` 会自动安装并信任本地开发证书；若曾拒绝，执行 `npx office-addin-dev-certs install` 重新安装。
- **端口 3000 被占用**：`scripts/serve.mjs` 支持 `PORT` 环境变量（默认 3000）；换端口需同步改 `manifest.xml` 里所有 `https://localhost:3000`、`package.json` 的 `dev_server_port`，再用 `PORT=3001 npm start` 启动。
- **想彻底清掉注册**：`npm run unregister`（或 `npm run debug:stop`）。

## License

[MIT](LICENSE) © 2026 q0-dev
