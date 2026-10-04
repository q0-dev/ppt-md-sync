// Office 集成层：宿主探测、选中文本读取/写入、文档内存储。
// 所有能力都做了降级处理——在普通浏览器里打开时自动进入独立模式。

let info = { host: null, platform: null };

function globalOffice() {
  return typeof Office === "undefined" ? null : Office;
}

export function getHost() {
  return info.host;
}

export function hostLabel() {
  switch (info.host) {
    case "Word": return "Word";
    case "Excel": return "Excel";
    case "PowerPoint": return "PowerPoint";
    default: return "独立窗口";
  }
}

export function canUseDocumentApis() {
  return ["Word", "Excel", "PowerPoint"].includes(info.host);
}

/** 等待 Office.onReady；超时或非 Office 环境时按“独立窗口”处理。 */
export async function initOffice(timeoutMs = 5000) {
  const office = globalOffice();
  if (!office) return info;
  try {
    const ready = await Promise.race([
      Promise.resolve(typeof office.onReady === "function" ? office.onReady() : null),
      new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (ready && ready.host) {
      info = { host: ready.host, platform: ready.platform ?? null };
    } else if (office.context && office.context.host) {
      info = { host: office.context.host, platform: office.context.platform ?? null };
    }
  } catch {
    // 非 Office 环境：保持独立窗口模式
  }
  return info;
}

/** 读取当前选中文本（Word/Excel/PowerPoint 通用接口）。 */
export function captureSelection() {
  return new Promise((resolve, reject) => {
    const office = globalOffice();
    if (!office || !canUseDocumentApis()) {
      reject(new Error("当前不在 Office 文档中"));
      return;
    }
    office.context.document.getSelectedDataAsync(office.CoercionType.Text, (result) => {
      if (result.status === office.AsyncResultStatus.Succeeded) {
        resolve(String(result.value ?? ""));
      } else {
        reject(new Error(result.error?.message || "读取选中内容失败"));
      }
    });
  });
}

/** 把文本写入当前选区（Word 光标处 / Excel 活动单元格 / PPT 选中文本框）。 */
export function writeToSelection(text) {
  return new Promise((resolve, reject) => {
    const office = globalOffice();
    if (!office || !canUseDocumentApis()) {
      reject(new Error("当前不在 Office 文档中"));
      return;
    }
    office.context.document.setSelectedDataAsync(
      String(text),
      { coercionType: office.CoercionType.Text },
      (result) => {
        if (result.status === office.AsyncResultStatus.Succeeded) resolve();
        else reject(new Error(result.error?.message || "写入文档失败"));
      }
    );
  });
}

export function settingsSupported() {
  const office = globalOffice();
  try {
    return !!(office && office.context && office.context.document && office.context.document.settings);
  } catch {
    return false;
  }
}

export function readDocumentSetting(key) {
  const office = globalOffice();
  if (!settingsSupported()) return null;
  const value = office.context.document.settings.get(key);
  return value === undefined ? null : value;
}

/** 写入文档内自定义设置并落盘（历史随文件保存）。 */
export function writeDocumentSetting(key, value) {
  return new Promise((resolve, reject) => {
    const office = globalOffice();
    if (!settingsSupported()) {
      reject(new Error("当前宿主不支持文档内存储"));
      return;
    }
    office.context.document.settings.set(key, value);
    office.context.document.settings.saveAsync((result) => {
      if (result.status === office.AsyncResultStatus.Succeeded) resolve();
      else reject(new Error(result.error?.message || "保存到文档失败"));
    });
  });
}

/** 浏览器存储模式下用于区分文档的 key。 */
export function documentKey() {
  const office = globalOffice();
  try {
    const url = office?.context?.document?.url;
    if (url) return url;
  } catch {
    // 忽略
  }
  return info.host ? `${info.host}:unsaved` : "standalone";
}

/**
 * 文档级自动展开：Office 只认写在「当前文档」里的 Office.AutoShowTaskpaneWithDocument 标记
 * （配合 manifest 中 TaskpaneId=Office.AutoShowTaskpaneWithDocument），无法对所有文件全局生效。
 */
export const AUTO_OPEN_SETTING = "Office.AutoShowTaskpaneWithDocument";
const AUTO_OPEN_INIT = "mdNoteSync.autoOpenInit.v1";

export function autoOpenSupported() {
  return settingsSupported();
}

export function isAutoOpenEnabled() {
  return readDocumentSetting(AUTO_OPEN_SETTING) === true;
}

function saveDocumentSettings() {
  const office = globalOffice();
  return new Promise((resolve, reject) => {
    office.context.document.settings.saveAsync((result) => {
      if (result.status === office.AsyncResultStatus.Succeeded) resolve();
      else reject(new Error(result.error?.message || "保存到文档失败"));
    });
  });
}

/** 开启 / 关闭「打开此文件时自动展开面板」。需要保存文件后才会持久生效。 */
export async function setAutoOpen(enabled) {
  if (!settingsSupported()) throw new Error("当前宿主不支持自动打开设置");
  const office = globalOffice();
  const settings = office.context.document.settings;
  if (enabled) settings.set(AUTO_OPEN_SETTING, true);
  else settings.remove(AUTO_OPEN_SETTING);
  await saveDocumentSettings();
}

/**
 * 首次在某个文档里打开面板时默认开启自动展开；用户在设置中关闭后不再自动恢复。
 * 返回本次是否新开启了自动展开。
 */
export async function ensureAutoOpenDefault() {
  if (!settingsSupported() || readDocumentSetting(AUTO_OPEN_INIT) === true) return false;
  const wasEnabled = isAutoOpenEnabled();
  try {
    if (!wasEnabled) await setAutoOpen(true);
    await writeDocumentSetting(AUTO_OPEN_INIT, true);
    return !wasEnabled && isAutoOpenEnabled();
  } catch {
    return false;
  }
}
