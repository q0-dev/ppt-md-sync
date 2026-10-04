# MD 待办 · 版本记录

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)

一个轻量的 Microsoft Office 任务窗格加载项（Word / PowerPoint / Excel）：**用 Markdown 随手记待办与完成事项，用「记录版本」保存快照**——可以对比差异、恢复历史，但没有分支、暂存区、远程仓库之类的负担，像是一个只保留"提交"的极简 git。

> 改完笔记点一下「记录版本 (Ctrl+Enter)」，就多一个带短指纹的线性快照；点开历史能看每一步的 +/- diff，也能一键恢复为草稿。

## 功能

- **随手记**：顶部输入框回车即添加待办，`Ctrl+Enter` 添加为已完成（可自动附时间戳）。
- **Markdown 编辑 / 预览**：预览模式下点勾选框直接完成任务，源文本自动同步。
- **轻量版本控制**：每个「记录版本」＝ 全量快照 + 短指纹（7 位）+ 增删行统计；历史线性、可看相邻版本 diff、可恢复任意版本为草稿。
- **Office 集成**：一键「引用」文档中选中的文字；「写入」把当前清单写入文档选区；提交时可附上一段文档上下文。
- **数据可控**：默认随文档保存（跟着文件走），可切换本机浏览器存储；支持导出 / 导入 `.md`，最多保留 300 个版本。

## 快速开始（Windows + 桌面版 Office）

前置：Windows 上装有桌面版 Word / PowerPoint / Excel（Microsoft 365 或 Office 2016+，建议新版），Node.js ≥ 20。

**日常使用只需要两件事**：

```bash
npm install          # 首次
npm run register     # ① 注册到 Office：一次性，之后一直有效（直到 unregister / debug:stop）
npm start            # ② 保持本地服务运行：用面板期间要一直开着（可改用 start-server.vbs 后台跑）
```

然后打开文档 → **插入 → 加载项 → 开发者加载项 → 添加**（每个文件做一次）。

**开发调试（可选）**：`debug` 系列是官方 `office-addin-debugging` 的一键流程，等于把上面两步外加"打开 Office"合在一起：

```bash
npm run debug        # 启动服务 + 注册 + 打开 PowerPoint（自动带一个已装载插件的演示文稿）
npm run debug:word   # 同上，打开 Word
npm run debug:stop   # 结束调试：停服务并注销（之后需要重新 register）
npm run unregister   # 只注销
```

上述命令需要写注册表并启动 Office，请在 **Windows** 终端里运行；WSL 里只能写代码、跑 `npm test`。本地服务本身是 `scripts/serve.mjs`（纯静态 HTTPS 服务），双击 `scripts/start-server.vbs` 可无窗口后台启动、放进启动文件夹还能开机自启。

### 注册成功的样子

`npm run register`（或 `npm run debug`）之后，在 Word / PowerPoint 里打开 **插入 → 加载项**（Word 里也叫「我的加载项」），应能看到 **开发者加载项 → MD 待办 · 版本记录**。能看到就说明注册与 manifest 没问题。

## 怎么让插件出现在具体文档里

Office 加载项是**文档级**装载的：注册只保证它在每个文档的加载项列表里可见，要让它真正运行（并在打开文件时自动展开面板），需要对这个文档做一次「插入」：

1. 打开 Word / PowerPoint，点 **插入 → 加载项**（Word 里也叫「我的加载项」）；
2. 在 **开发者加载项** 里选择「MD 待办 · 版本记录」→ 添加；
3. 首次会弹一次信任提示；面板打开后保存文件，之后每次打开该文件都会自动展开。

> **为什么不能「打开任意 PPT 就自动有插件」？** 按官方定义，autoopen 是文档级机制，必须逐文件写入引用（见 [Automatically open a task pane with a document](https://learn.microsoft.com/zh-cn/office/dev/add-ins/develop/automatically-open-a-task-pane-with-a-document)）。对"任意文档自动运行"只有 Microsoft 365 管理员在管理中心**集中部署**（事件激活）才支持，且事件激活被限制为不能弹出任务窗格 UI；Marketplace 分发的加载项也不支持 autoopen。所以本地开发版的正确姿势就是：**每个文件插入一次，之后一直自动展开**。

面板内容依赖本地服务常开（否则按钮在、面板打不开）：双击 `scripts/start-server.vbs` 可后台无窗口启动；把它放进 Windows「启动」文件夹（`Win+R` 输入 `shell:startup`）即可开机自启。

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

改完代码后在 Office 里重新打开任务窗格（或右键「重新加载」）即可看到最新版；改 `manifest.xml` 后需要重启 Office（必要时重跑一次 `npm run register`）。

目录结构（Yeoman 风格、纯静态无打包）：

```
manifest.xml                 # 三合一加载项清单（开发期 URL 指向本地服务）
src/
  commands/commands.html     # 功能命令页（VersionOverrides 必需的 FunctionFile）
  taskpane/
    taskpane.html            # 任务窗格页面
    taskpane.css             # 样式（含深色模式）
    taskpane.js              # 主程序：界面、快捷键、提交流程
    md.js                    # 极简 Markdown 渲染 + 任务操作
    store.js                 # 线性版本仓库：快照、短指纹、导出
    diff.js                  # 行级 diff（LCS）
    office.js                # Office 适配层（宿主探测、选中读写、文档存储）
scripts/
  serve.mjs                  # 本地 HTTPS 服务（office-addin-dev-certs 证书）
  start-server.vbs           # 后台启动服务（可用于开机自启）
tests/                       # node:test 单元测试
```

### 在 WSL 里开发

可以在 WSL 里写代码、跑 `npm test`，但 **Office 只能装载 Windows 侧的加载项**：把项目放到 Windows 盘（例如 `D:\projects\ppt-md`），在 Windows 终端里执行 `npm install` 与 `npm run register`（或 `npm run debug`）。WSL 改完代码后同步到该目录即可，无需重装依赖；`npm start` 在 WSL 与 Windows 里都能提供 https://localhost:3000。

## 常见问题

- **注册后在加载项列表里找不到它**：确认 `npm run register` 没有报错，且没有执行过 `npm run debug:stop` / `npm run unregister`；然后完全重启 Office。
- **对话框能看见，但打开文档没出现按钮**：正常——注册只负责"可见"，还需要在加载项对话框里插入一次（见上文）。
- **任务窗格打不开 / 一直转圈**：本地服务没在跑。执行 `npm start` 或双击 `scripts/start-server.vbs`。
- **保存过文件，下次打开仍不自动展开面板**：勾选设置里的「打开此文件时自动展开面板」，保存文件后再重开；该开关按文件生效。
- **面板提示证书不受信任**：首次运行 `npm run debug` 会自动安装并信任本地开发证书；若曾拒绝，执行 `npx office-addin-dev-certs install` 重新安装。
- **端口 3000 被占用**：`scripts/serve.mjs` 支持 `PORT` 环境变量（默认 3000）；换端口需同步改 `manifest.xml` 里的 `https://localhost:3000` 与 `package.json` 的 `dev_server_port`。
- **想彻底清掉注册**：`npm run unregister`。

## License

[MIT](LICENSE) © 2026 q0-dev
