import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_OPEN_SETTING,
  autoOpenSupported,
  canUseDocumentApis,
  captureSelection,
  documentKey,
  ensureAutoOpenDefault,
  getHost,
  hostLabel,
  initOffice,
  isAutoOpenEnabled,
  readDocumentSetting,
  setAutoOpen,
  settingsSupported,
  writeDocumentSetting,
  writeToSelection,
} from "../src/js/office.js";

test("非 Office 环境降级为独立窗口并拒绝文档操作", async () => {
  delete globalThis.Office;
  const info = await initOffice(50);
  assert.equal(info.host, null);
  assert.equal(getHost(), null);
  assert.equal(hostLabel(), "独立窗口");
  assert.equal(canUseDocumentApis(), false);
  await assert.rejects(() => captureSelection(), /不在 Office/);
  await assert.rejects(() => writeToSelection("x"), /不在 Office/);
  assert.equal(settingsSupported(), false);
  assert.equal(readDocumentSetting("k"), null);
  await assert.rejects(() => writeDocumentSetting("k", 1), /不支持/);
  assert.equal(documentKey(), "standalone");
  assert.equal(autoOpenSupported(), false);
  assert.equal(isAutoOpenEnabled(), false);
  assert.equal(await ensureAutoOpenDefault(), false);
  await assert.rejects(() => setAutoOpen(true), /不支持/);
});

test("Office 环境下识别宿主并支持读写文档设置", async () => {
  const settings = new Map();
  globalThis.Office = {
    onReady: async () => ({ host: "PowerPoint", platform: "PC" }),
    CoercionType: { Text: "text" },
    AsyncResultStatus: { Succeeded: "succeeded" },
    context: {
      document: {
        url: "https://contoso.example/demo.pptx",
        settings: {
          get: (key) => settings.get(key),
          set: (key, value) => settings.set(key, value),
          remove: (key) => settings.delete(key),
          saveAsync: (cb) => cb({ status: "succeeded" }),
        },
        getSelectedDataAsync: (type, cb) => cb({ status: "succeeded", value: "选中的文字" }),
        setSelectedDataAsync: (text, opts, cb) => cb({ status: "succeeded" }),
      },
    },
  };

  const info = await initOffice(50);
  assert.equal(info.host, "PowerPoint");
  assert.equal(getHost(), "PowerPoint");
  assert.equal(hostLabel(), "PowerPoint");
  assert.equal(canUseDocumentApis(), true);
  assert.equal(documentKey(), "https://contoso.example/demo.pptx");

  assert.equal(await captureSelection(), "选中的文字");
  await writeToSelection("写入内容");
  assert.equal(readDocumentSetting("missing"), null);
  await writeDocumentSetting("k", { a: 1 });
  assert.deepEqual(readDocumentSetting("k"), { a: 1 });
});

test("自动展开按文档生效：首次默认开启，用户关闭后不再自动恢复", async () => {
  const settings = new Map();
  globalThis.Office = {
    onReady: async () => ({ host: "PowerPoint" }),
    AsyncResultStatus: { Succeeded: "succeeded" },
    context: {
      document: {
        settings: {
          get: (key) => settings.get(key),
          set: (key, value) => settings.set(key, value),
          remove: (key) => settings.delete(key),
          saveAsync: (cb) => cb({ status: "succeeded" }),
        },
      },
    },
  };
  await initOffice(50);
  assert.equal(autoOpenSupported(), true);
  assert.equal(isAutoOpenEnabled(), false);

  assert.equal(await ensureAutoOpenDefault(), true);
  assert.equal(settings.get(AUTO_OPEN_SETTING), true);
  assert.equal(isAutoOpenEnabled(), true);
  assert.equal(await ensureAutoOpenDefault(), false);

  await setAutoOpen(false);
  assert.equal(isAutoOpenEnabled(), false);
  assert.equal(await ensureAutoOpenDefault(), false);
  assert.equal(settings.get(AUTO_OPEN_SETTING), undefined);

  await setAutoOpen(true);
  assert.equal(isAutoOpenEnabled(), true);
});

test("不支持文档设置的环境下自动展开静默跳过", async () => {
  globalThis.Office = {};
  assert.equal(await ensureAutoOpenDefault(), false);
  assert.equal(isAutoOpenEnabled(), false);
});
