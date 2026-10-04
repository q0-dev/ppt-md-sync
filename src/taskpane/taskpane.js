// MD 待办 · 版本记录 —— 任务窗格主程序
// 纯静态实现：DOM 接线、存储选择、版本流程、预览与 diff 展示。

import { diffLines, diffStats } from "./diff.js";
import {
  appendQuote,
  appendTask,
  countTasks,
  defaultTemplate,
  escapeHtml,
  fmtStamp,
  renderMarkdown,
  toggleTaskLine,
} from "./md.js";
import {
  addVersion,
  createStore,
  exportCurrentMd,
  exportHistoryMd,
  findVersion,
  fmtDateTime,
  fmtShortTime,
  formatBytes,
  headVersion,
  normalizeStore,
  PREFS_KEY,
  storeBytes,
  STORE_KEY,
} from "./store.js";
import {
  autoOpenSupported,
  canUseDocumentApis,
  captureSelection,
  documentKey,
  ensureAutoOpenDefault,
  hostLabel,
  initOffice,
  isAutoOpenEnabled,
  readDocumentSetting,
  setAutoOpen,
  settingsSupported,
  writeDocumentSetting,
  writeToSelection,
} from "./office.js";

const $ = (id) => document.getElementById(id);

const state = {
  store: null,
  backend: "browser", // 'document' | 'browser'
  prefs: { storage: "auto", autoStamp: true, mode: "edit", filter: "all" },
  openVersion: null,
  saveTimer: null,
  persistFailed: false,
};

let toastTimer = null;
let clearArmed = false;
let clearTimer = null;

// ---------- 存储 ----------

function docStorageAvailable() {
  return settingsSupported() && canUseDocumentApis();
}

function browserKey() {
  return `${STORE_KEY}::${documentKey()}`;
}

async function loadFrom(backend) {
  try {
    if (backend === "document") {
      const raw = readDocumentSetting(STORE_KEY);
      if (!raw) return null;
      return normalizeStore(typeof raw === "string" ? JSON.parse(raw) : raw);
    }
    const raw = localStorage.getItem(browserKey());
    return raw ? normalizeStore(JSON.parse(raw)) : null;
  } catch (err) {
    console.warn("读取本地数据失败", err);
    return null;
  }
}

async function saveTo(backend, store) {
  if (backend === "document") {
    await writeDocumentSetting(STORE_KEY, JSON.stringify(store));
  } else {
    localStorage.setItem(browserKey(), JSON.stringify(store));
  }
}

function scheduleSave() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => persist(), 700);
}

async function persist() {
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  try {
    await saveTo(state.backend, state.store);
    state.persistFailed = false;
  } catch (err) {
    console.warn("保存失败", err);
    if (!state.persistFailed) {
      state.persistFailed = true;
      toast(`保存失败（${err.message}）· 可在设置中改用浏览器存储`);
    }
  }
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) Object.assign(state.prefs, JSON.parse(raw));
  } catch {
    // 忽略：使用默认偏好
  }
}

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs));
  } catch {
    // 忽略
  }
}

// ---------- 通用 UI ----------

function toast(message, ms = 2400) {
  const el = $("toast");
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), ms);
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function dateStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    area.remove();
    return ok;
  }
}

// ---------- 草稿与状态 ----------

function syncEditorFromStore() {
  $("editor").value = state.store.draft;
}

/** 外部修改草稿（快速记录 / 恢复 / 导入）时使用。 */
function setDraft(value) {
  state.store.draft = value;
  syncEditorFromStore();
  markDirty();
}

function markDirty() {
  state.store.updatedAt = Date.now();
  refreshStatus();
  scheduleSave();
}

function refreshStatus() {
  const head = headVersion(state.store);
  const draft = state.store.draft;
  const contentChanged = !head || head.content !== draft;
  const ctxChanged = $("contextText").value.trim() !== "";
  const stats = diffStats(head ? head.content : "", draft);
  const { total, done } = countTasks(draft);
  const label = $("draftStats");

  if (!draft.trim()) label.textContent = "空清单";
  else if (!head) label.textContent = `新清单 · ${total} 项 · +${stats.add} 行`;
  else if (contentChanged) label.textContent = `相对 #${head.n}：+${stats.add} / −${stats.del} · ${done}/${total} 完成`;
  else if (ctxChanged) label.textContent = "仅上下文有变化";
  else label.textContent = `与 #${head.n} 相同 · ${done}/${total} 完成`;

  $("btnCommit").disabled = !draft.trim() || (!contentChanged && !ctxChanged);
}

async function commit() {
  const head = headVersion(state.store);
  if (!state.store.draft.trim()) {
    toast("清单为空，先写点内容");
    return;
  }
  if (head && head.content === state.store.draft && !$("contextText").value.trim()) {
    toast("与最新版本相同，无需记录");
    return;
  }
  const version = addVersion(state.store, {
    msg: $("commitMsg").value,
    content: state.store.draft,
    ctx: $("contextText").value,
  });
  $("commitMsg").value = "";
  $("contextText").value = "";
  $("contextBox").classList.add("hidden");
  $("btnContextToggle").classList.remove("active");
  await persist();
  refreshStatus();
  renderHistory();
  updateStorageInfo();
  renderPreviewIfActive();
  toast(`已记录 #${version.n} · +${version.stat.add} / −${version.stat.del}`);
}

// ---------- 笔记视图 ----------

function setMode(mode) {
  state.prefs.mode = mode === "preview" ? "preview" : "edit";
  savePrefs();
  $("modeEdit").classList.toggle("active", state.prefs.mode === "edit");
  $("modePreview").classList.toggle("active", state.prefs.mode === "preview");
  $("editor").classList.toggle("hidden", state.prefs.mode !== "edit");
  $("preview").classList.toggle("hidden", state.prefs.mode !== "preview");
  if (state.prefs.mode === "preview") renderPreview();
}

function renderPreviewIfActive() {
  if (state.prefs.mode === "preview") renderPreview();
}

function renderPreview() {
  const { html, stats } = renderMarkdown(state.store.draft);
  const body = $("previewBody");
  const scrollTop = body.scrollTop;
  body.innerHTML = html;
  body.scrollTop = scrollTop;
  body.className = `md-body filter-${state.prefs.filter}`;
  $("taskStats").textContent = `${stats.done}/${stats.total} 完成`;
}

function quickAdd(done) {
  const input = $("quickInput");
  const text = input.value.trim();
  if (!text) {
    input.focus();
    return;
  }
  setDraft(appendTask(state.store.draft, text, { done, stamp: done && state.prefs.autoStamp ? fmtStamp() : "" }));
  input.value = "";
  input.focus();
  renderPreviewIfActive();
  toast(done ? "已记录完成项" : "已添加待办");
}

function wrapSelection(prefix, suffix = prefix, placeholder = "文本") {
  const editor = $("editor");
  const { selectionStart, selectionEnd, value } = editor;
  const selected = value.slice(selectionStart, selectionEnd) || placeholder;
  editor.setRangeText(prefix + selected + suffix, selectionStart, selectionEnd, "select");
  editor.focus();
  state.store.draft = editor.value;
  markDirty();
}

function insertTaskPrefix() {
  const editor = $("editor");
  const value = editor.value;
  const lineStart = value.lastIndexOf("\n", editor.selectionStart - 1) + 1;
  editor.setRangeText("- [ ] ", lineStart, lineStart, "end");
  editor.focus();
  state.store.draft = editor.value;
  markDirty();
}

async function quoteDocumentSelection() {
  try {
    const text = await captureSelection();
    if (!text.trim()) {
      toast("文档中没有选中文本");
      return;
    }
    setDraft(appendQuote(state.store.draft, text));
    renderPreviewIfActive();
    toast("已引用选中的文本");
  } catch (err) {
    toast(err.message);
  }
}

async function writeNoteToDocument() {
  if (!state.store.draft.trim()) {
    toast("清单为空");
    return;
  }
  try {
    await writeToSelection(state.store.draft);
    toast("已把当前清单写入文档选区");
  } catch (err) {
    toast(`写入失败：${err.message}`);
  }
}

async function captureContextFromDocument() {
  try {
    const text = await captureSelection();
    if (!text.trim()) {
      toast("文档中没有选中文本");
      return;
    }
    $("contextText").value = text.slice(0, 10000);
    refreshStatus();
    toast("已抓取选中文本作为上下文");
  } catch (err) {
    toast(err.message);
  }
}

// ---------- 历史视图 ----------

function setTab(tab) {
  document.body.dataset.tab = tab;
  document.querySelectorAll(".tab").forEach((el) => el.classList.toggle("active", el.dataset.tab === tab));
  $("viewNotes").classList.toggle("active", tab === "notes");
  $("viewHistory").classList.toggle("active", tab === "history");
  if (tab === "history") {
    hideDetail();
    renderHistory();
  }
}

function renderHistory() {
  $("verCount").textContent = String(state.store.versions.length);
  const list = $("historyList");
  if (!state.store.versions.length) {
    list.innerHTML = '<div class="empty">还没有版本记录。<br/>在「笔记」里写点内容，然后点「记录版本」。</div>';
    return;
  }
  list.innerHTML = state.store.versions
    .slice()
    .reverse()
    .map(
      (v) => `
      <button class="ver-item" data-n="${v.n}">
        <div class="ver-top"><span class="ver-n">#${v.n}</span><span class="ver-msg">${escapeHtml(v.msg)}</span></div>
        <div class="ver-sub">
          <span>${fmtShortTime(new Date(v.t))}</span>
          ${v.stat ? `<span class="stat-add">+${v.stat.add}</span><span class="stat-del">−${v.stat.del}</span>` : ""}
          ${v.ctx ? '<span class="tag">上下文</span>' : ""}
          <span class="ver-hash">${escapeHtml(v.hash)}</span>
        </div>
      </button>`
    )
    .join("");
}

function diffRow(op) {
  const sign = op.type === "add" ? "+" : op.type === "del" ? "−" : " ";
  const text = escapeHtml(op.text) || "&nbsp;";
  return `<div class="dl dl-${op.type}"><span class="dl-sign">${sign}</span><span class="dl-text">${text}</span></div>`;
}

function renderDiffHtml(oldText, newText) {
  const { ops, add, del } = diffLines(oldText, newText);
  if (!add && !del) return '<div class="empty small">与上一版本内容相同</div>';
  const rows = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i].type === "eq") {
      let j = i;
      while (j < ops.length && ops[j].type === "eq") j++;
      const run = j - i;
      if (run > 8) {
        for (const item of ops.slice(i, i + 3)) rows.push(diffRow(item));
        rows.push(`<div class="dl-skip">⋯ ${run - 6} 行未变 ⋯</div>`);
        for (const item of ops.slice(j - 3, j)) rows.push(diffRow(item));
      } else {
        for (const item of ops.slice(i, j)) rows.push(diffRow(item));
      }
      i = j;
    } else {
      rows.push(diffRow(ops[i]));
      i++;
    }
  }
  return rows.join("");
}

function showDetail(n) {
  const version = findVersion(state.store, n);
  if (!version) return;
  state.openVersion = n;
  const parent = version.parent == null ? null : findVersion(state.store, version.parent);
  $("historyList").classList.add("hidden");
  $("versionDetail").classList.remove("hidden");
  $("detailTitle").textContent = `#${version.n}`;
  $("detailMeta").textContent = [
    fmtDateTime(new Date(version.t)),
    version.msg,
    `指纹 ${version.hash}`,
    parent ? `父版本 #${parent.n}` : "初始版本",
  ].join(" · ");
  const ctx = $("detailCtx");
  if (version.ctx) {
    ctx.textContent = version.ctx;
    ctx.classList.remove("hidden");
  } else {
    ctx.classList.add("hidden");
  }
  $("detailDiff").innerHTML = renderDiffHtml(parent ? parent.content : "", version.content);
}

function hideDetail() {
  state.openVersion = null;
  $("versionDetail").classList.add("hidden");
  $("historyList").classList.remove("hidden");
}

function restoreVersion() {
  const version = findVersion(state.store, state.openVersion);
  if (!version) return;
  setDraft(version.content);
  setTab("notes");
  setMode("edit");
  $("editor").focus();
  toast(`已把 #${version.n} 恢复为草稿 · 记录后生成新版本`);
}

// ---------- 设置 ----------

function updateStorageInfo() {
  const place = state.backend === "document" ? "文档内（随文件保存/同步）" : "本机浏览器（按文档区分）";
  const size = formatBytes(storeBytes(state.store));
  $("storageInfo").textContent = `当前位置：${place} · 版本 ${state.store.versions.length} 个 · 约 ${size}`;
}

async function switchStorage(mode) {
  state.prefs.storage = mode;
  savePrefs();
  let target = mode === "auto" ? (docStorageAvailable() ? "document" : "browser") : mode;
  if (target === "document" && !docStorageAvailable()) {
    toast("当前环境不支持文档内存储，已改用浏览器存储");
    target = "browser";
    state.prefs.storage = "browser";
    savePrefs();
    $("storageSelect").value = "browser";
  }
  if (target === state.backend) {
    updateStorageInfo();
    return;
  }
  const loaded = await loadFrom(target);
  if (loaded && (loaded.versions.length || loaded.draft.trim())) {
    state.store = loaded;
    state.backend = target;
    toast("已切换到该存储位置中的已有数据");
  } else {
    state.backend = target;
    await persist();
    toast("已切换存储位置，当前数据已复制");
  }
  syncEditorFromStore();
  refreshStatus();
  renderHistory();
  renderPreviewIfActive();
  updateStorageInfo();
}

// ---------- 事件绑定 ----------

function bindEvents() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => setTab(tab.dataset.tab));
  });

  $("modeEdit").addEventListener("click", () => setMode("edit"));
  $("modePreview").addEventListener("click", () => setMode("preview"));

  $("editor").addEventListener("input", () => {
    state.store.draft = $("editor").value;
    markDirty();
  });

  $("quickTodo").addEventListener("click", () => quickAdd(false));
  $("quickDone").addEventListener("click", () => quickAdd(true));
  $("quickInput").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    quickAdd(event.ctrlKey || event.metaKey);
  });

  $("btnBold").addEventListener("click", () => wrapSelection("**", "**"));
  $("btnTask").addEventListener("click", insertTaskPrefix);
  $("btnQuote").addEventListener("click", quoteDocumentSelection);
  $("btnWriteDoc").addEventListener("click", writeNoteToDocument);

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.prefs.filter = chip.dataset.filter;
      savePrefs();
      document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
      $("previewBody").className = `md-body filter-${state.prefs.filter}`;
    });
  });

  $("previewBody").addEventListener("change", (event) => {
    const checkbox = event.target;
    if (!checkbox.matches('input[type="checkbox"][data-line]')) return;
    const lineIndex = Number(checkbox.dataset.line);
    const result = toggleTaskLine(state.store.draft, lineIndex, {
      stamp: state.prefs.autoStamp ? fmtStamp() : "",
    });
    if (!result.changed) return;
    state.store.draft = result.src;
    $("editor").value = result.src;
    markDirty();
    renderPreview();
  });

  $("historyList").addEventListener("click", (event) => {
    const item = event.target.closest(".ver-item");
    if (item) showDetail(Number(item.dataset.n));
  });
  $("btnDetailBack").addEventListener("click", hideDetail);
  $("btnRestore").addEventListener("click", restoreVersion);
  $("btnCopyVersion").addEventListener("click", async () => {
    const version = findVersion(state.store, state.openVersion);
    if (!version) return;
    toast((await copyText(version.content)) ? "已复制该版本内容" : "复制失败，请手动选择文本");
  });

  $("btnContextToggle").addEventListener("click", () => {
    const box = $("contextBox");
    const hidden = box.classList.toggle("hidden");
    $("btnContextToggle").classList.toggle("active", !hidden);
    if (!hidden) $("contextText").focus();
  });
  $("btnCapture").addEventListener("click", captureContextFromDocument);
  $("contextText").addEventListener("input", refreshStatus);
  $("commitMsg").addEventListener("input", refreshStatus);
  $("btnCommit").addEventListener("click", commit);

  $("btnSettings").addEventListener("click", () => {
    $("settingsPanel").classList.remove("hidden");
    updateStorageInfo();
  });
  $("btnCloseSettings").addEventListener("click", () => $("settingsPanel").classList.add("hidden"));

  $("storageSelect").addEventListener("change", () => switchStorage($("storageSelect").value));
  $("optAutoStamp").addEventListener("change", () => {
    state.prefs.autoStamp = $("optAutoStamp").checked;
    savePrefs();
  });
  $("optAutoOpen").addEventListener("change", async () => {
    const box = $("optAutoOpen");
    try {
      await setAutoOpen(box.checked);
      toast(box.checked ? "已开启：打开此文件时自动展开面板（记得保存文件）" : "已关闭此文件的自动展开");
    } catch (err) {
      box.checked = !box.checked;
      toast(`设置失败：${err.message}`);
    }
  });

  $("btnExportCurrent").addEventListener("click", () =>
    downloadText(`todo-${dateStamp()}.md`, exportCurrentMd(state.store))
  );
  $("btnExportHistory").addEventListener("click", () =>
    downloadText(`todo-history-${dateStamp()}.md`, exportHistoryMd(state.store))
  );
  $("btnImport").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      setDraft(text);
      setTab("notes");
      setMode("edit");
      toast(`已导入 ${file.name} 作为草稿 · 记录后生成版本`);
    } catch (err) {
      toast(`导入失败：${err.message}`);
    } finally {
      event.target.value = "";
    }
  });

  $("btnClearAll").addEventListener("click", async () => {
    const button = $("btnClearAll");
    if (!clearArmed) {
      clearArmed = true;
      button.classList.add("armed");
      button.textContent = "再次点击确认清空";
      clearTimer = setTimeout(() => {
        clearArmed = false;
        button.classList.remove("armed");
        button.textContent = "清空所有草稿与历史";
      }, 3000);
      return;
    }
    clearTimeout(clearTimer);
    clearArmed = false;
    button.classList.remove("armed");
    button.textContent = "清空所有草稿与历史";
    state.store = createStore(defaultTemplate());
    await persist();
    syncEditorFromStore();
    refreshStatus();
    renderHistory();
    renderPreviewIfActive();
    updateStorageInfo();
    toast("已清空");
  });

  document.addEventListener("keydown", (event) => {
    const mod = event.ctrlKey || event.metaKey;
    if (!mod) return;
    const key = event.key.toLowerCase();
    if (key === "enter" || key === "s") {
      event.preventDefault();
      commit();
    } else if (key === "b" && document.activeElement === $("editor")) {
      event.preventDefault();
      wrapSelection("**", "**");
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && state.saveTimer) persist();
  });
  window.addEventListener("beforeunload", () => {
    if (state.saveTimer) persist();
  });
}

// ---------- 启动 ----------

async function boot() {
  await initOffice();
  $("hostBadge").textContent = hostLabel();

  const docHost = canUseDocumentApis();
  $("btnQuote").disabled = !docHost;
  $("btnWriteDoc").disabled = !docHost;
  const officeOnlyHint = "需在 Word / Excel / PowerPoint 中使用";
  $("btnQuote").title = docHost ? "引用文档中选中的文本" : officeOnlyHint;
  $("btnWriteDoc").title = docHost ? "把当前清单写入文档选区" : officeOnlyHint;

  const autoOpenBox = $("optAutoOpen");
  autoOpenBox.disabled = !autoOpenSupported();
  $("optAutoOpenHint").textContent = autoOpenSupported()
    ? "只对当前文件生效，保存后下次打开自动展开。"
    : officeOnlyHint;
  const autoOpenJustEnabled = await ensureAutoOpenDefault();
  autoOpenBox.checked = isAutoOpenEnabled();
  if (autoOpenJustEnabled) toast("已为当前文件开启自动展开 · 保存后下次打开自动显示面板", 3200);

  loadPrefs();
  $("storageSelect").value = state.prefs.storage;
  $("optAutoStamp").checked = state.prefs.autoStamp !== false;
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.filter === state.prefs.filter);
  });

  state.backend =
    state.prefs.storage === "document" && !docStorageAvailable()
      ? "browser"
      : state.prefs.storage === "browser"
        ? "browser"
        : docStorageAvailable()
          ? "document"
          : "browser";

  state.store = (await loadFrom(state.backend)) || createStore(defaultTemplate());

  bindEvents();
  syncEditorFromStore();
  refreshStatus();
  renderHistory();
  updateStorageInfo();
  setMode(state.prefs.mode === "preview" ? "preview" : "edit");
  setTab("notes");
}

boot();
