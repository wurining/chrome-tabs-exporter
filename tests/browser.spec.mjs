import { test, expect } from "@playwright/test";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { launchExtension } from "./browser-helper.mjs";

async function selectAllWindows(app) {
  await app.popup.locator('#window-picker > summary').click();
  await app.popup.locator('#all-windows').check();
  await app.popup.locator('#window-picker > summary').click();
}

test("real extension reads grouped tabs, selects windows, filters own pages and exports JSON", async () => {
  const app = await launchExtension();
  try {
    await expect(app.popup.locator("#tab-count")).toHaveText("4");
    await expect(app.popup.locator("#group-count")).toHaveText("2");
    await expect(app.popup.getByRole("checkbox", { name: "Untitled group 2", exact: true })).toBeChecked();
    await app.popup.locator('#include-ungrouped').uncheck();
    await expect(app.popup.locator("#tab-count")).toHaveText("3");
    await selectAllWindows(app);
    await expect(app.popup.locator("#tab-count")).toHaveText("5");
    await app.popup.locator('#include-ungrouped').check();
    await expect(app.popup.locator("#tab-count")).toHaveText("7");
    const about = await app.context.newPage();
    await about.goto(`${app.url}about.html`);
    await expect(about.locator(".support-card:visible")).toHaveCount(1);
    await expect(about.locator("#coffee-link")).toHaveAttribute("href", "https://buymeacoffee.com/chaiwang");
    await expect(about.locator("#wechat-card")).toBeHidden();
    await expect(about.locator("#alipay-card")).toBeHidden();
    await app.popup.locator("#refresh").click();
    await expect(app.popup.locator("#tab-count")).toHaveText("7");
    await app.popup.locator("#export-json").click();
    await expect(app.popup.locator("#status")).toContainText("Download started");
    await expect.poll(async () => app.worker.evaluate(async () => (await chrome.downloads.search({}))[0]?.state)).toBe("complete");
    const [download] = await app.worker.evaluate(() => chrome.downloads.search({}));
    const data = JSON.parse(await readFile(download.filename, "utf8"));
    expect(data.windows).toHaveLength(2);
    expect(data.schemaVersion).toBe(1);
    expect(data.windows.flatMap((win) => [...win.groups.flatMap((entry) => entry.tabs), ...win.ungroupedTabs])).toHaveLength(7);
    expect(JSON.stringify(data)).not.toMatch(/favIconUrl|audible|chrome-extension:\/\//);
  } finally { await app.close(); }
});

test("export dispatched from a popup finishes after that popup closes", async () => {
  const app = await launchExtension();
  try {
    await expect(app.popup.locator("#tab-count")).toHaveText("4");
    await app.popup.evaluate(async (windowId) => {
      const tabIds = (await chrome.tabs.query({ windowId })).map((tab) => tab.id);
      void chrome.runtime.sendMessage({ type: "export", kind: "markdown", language: "en", options: { scope: "selected", includeUngrouped: true, windowIds: [windowId], tabIds } });
    }, app.firstWindowId);
    await app.popup.close();
    await expect.poll(async () => app.worker.evaluate(async () => (await chrome.downloads.search({}))[0]?.state)).toBe("complete");
    const [download] = await app.worker.evaluate(() => chrome.downloads.search({}));
    const content = await readFile(download.filename, "utf8");
    expect(content).toContain("Research \\[2026\\]");
    expect(content).toContain("项目笔记");
  } finally { await app.close(); }
});

test("empty scope and canceled initiation cannot display success", async () => {
  const app = await launchExtension();
  try {
    await expect(app.popup.locator("#export-json")).toBeEnabled();
    await app.popup.evaluate(() => { chrome.runtime.sendMessage = async () => ({ ok: false }); });
    await app.popup.locator("#export-json").click();
    await expect(app.popup.locator("#status")).toContainText("File not saved");
    expect(await app.popup.evaluate(() => document.body.scrollHeight)).toBeLessThanOrEqual(600);
    await app.worker.evaluate(async (windowId) => {
      const tabs = await chrome.tabs.query({ windowId });
      await chrome.tabs.ungroup(tabs.filter((tab) => tab.groupId >= 0).map((tab) => tab.id));
    }, app.firstWindowId);
    await app.popup.locator("#refresh").click();
    await expect(app.popup.locator("#tab-count")).toHaveText("4");
    await app.popup.locator("#include-ungrouped").uncheck();
    await expect(app.popup.locator("#tab-count")).toHaveText("0");
    await expect(app.popup.locator("#export-json")).toBeDisabled();
    await expect(app.popup.locator("#empty-message")).toContainText("No tabs in");
  } finally { await app.close(); }
});

test("slow previous refresh cannot replace a newer snapshot", async () => {
  const app = await launchExtension();
  try {
    await expect(app.popup.locator("#tab-count")).toHaveText("4");
    await app.popup.evaluate(() => {
      const original = chrome.tabs.query.bind(chrome.tabs);
      let query = 0;
      chrome.tabs.query = async (options) => {
        const tabs = await original(options);
        if (++query === 1) { await new Promise((resolve) => setTimeout(resolve, 300)); return []; }
        return tabs;
      };
    });
    await app.popup.locator('#refresh').click();
    await app.popup.locator('#refresh').click();
    await expect(app.popup.locator('#tab-count')).toHaveText('4');
    await app.popup.waitForTimeout(350);
    await expect(app.popup.locator('#tab-count')).toHaveText('4');
  } finally { await app.close(); }
});

for (const [locale, language, expectedScope] of [["en-US", "en", "Current window"], ["zh-CN", "zh-CN", "当前窗口"]]) {
  for (const colorScheme of ["light", "dark"]) {
    test(`${locale} ${colorScheme} loads packaged translations, keyboard focus and safe preview`, async () => {
      const app = await launchExtension({ locale, colorScheme });
      try {
        await expect(app.popup.locator("#tab-count")).toHaveText("4");
        await expect(app.popup.locator("html")).toHaveAttribute("lang", language);
        await app.popup.locator("#window-picker > summary").click();
        await expect(app.popup.locator("#window-list")).toContainText(expectedScope);
        await app.popup.locator("#window-picker > summary").click();
        expect(await app.popup.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches)).toBe(colorScheme === "dark");
        await app.popup.locator("#all-tabs").focus();
        await app.popup.keyboard.press("Space");
        await expect(app.popup.locator("#tab-count")).toHaveText("0");
        await app.popup.keyboard.press("Space");
        await expect(app.popup.locator("#tab-count")).toHaveText("4");
        await expect(app.popup.locator("#preview")).toContainText("Specifications [draft] & examples");
        await expect(app.popup.locator(".preview img")).toHaveCount(0);
        expect(await app.popup.evaluate(() => document.body.scrollHeight)).toBeLessThanOrEqual(600);
        expect(await app.popup.locator(".footer").evaluate((element) => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(600);
      } finally { await app.close(); }
    });
  }
}

test("the exact store ZIP installs and exports in an isolated Chrome profile", async () => {
  execFileSync(process.execPath, ["scripts/package.mjs"], { stdio: "pipe" });
  const directory = await mkdtemp(path.join(tmpdir(), "chrome-tabs-exporter-zip-"));
  execFileSync("python3", ["-c", "import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])", "dist/chrome-tabs-exporter-1.0.0.zip", directory]);
  const app = await launchExtension({ extensionPath: directory });
  try {
    await expect(app.popup.locator("#tab-count")).toHaveText("4");
    await app.popup.locator("#export-json").click();
    await expect.poll(async () => app.worker.evaluate(async () => (await chrome.downloads.search({}))[0]?.state)).toBe("complete");
    const [download] = await app.worker.evaluate(() => chrome.downloads.search({}));
    expect(JSON.parse(await readFile(download.filename, "utf8")).schemaVersion).toBe(1);
    const opened = app.context.waitForEvent('page');
    await app.popup.locator('.import-link').click();
    const importer = await opened;
    await importer.waitForURL(`${app.url}import.html`);
    await importer.locator('#import-file').setInputFiles(download.filename);
    await expect(importer.locator('#import-tab-count')).toHaveText('4');
    await importer.locator('#restore').click();
    await expect(importer.locator('#restore-status')).toContainText('Restore complete. Tabs opened: 4.');
    const about = await app.context.newPage();
    await about.goto(`${app.url}about.html#support`);
    await expect(about.locator('#coffee-link')).toHaveAttribute('href', 'https://buymeacoffee.com/chaiwang');
    await expect(about.locator('#coffee-qr')).toBeVisible();
    await expect.poll(() => about.locator('#coffee-qr').evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});

test("a large Unicode data URL saves every tab using the real downloads API", async () => {
  const app = await launchExtension();
  try {
    const result = await app.popup.evaluate(async () => {
      const { downloadExport } = await import(chrome.runtime.getURL("lib/download.js"));
      const data = [{ groups: [], ungroupedTabs: Array.from({ length: 10000 }, (_, n) => ({ title: `中文标签页 ${n}`, url: `https://example.com/${n}?q=long-url-parameter&complete=true` })) }];
      return downloadExport(data, { scope: "all", includeUngrouped: true }, "json", () => "");
    });
    expect(result.state).toBe("started");
    await expect.poll(async () => app.worker.evaluate(async () => (await chrome.downloads.search({}))[0]?.state)).toBe("complete");
    const [download] = await app.worker.evaluate(() => chrome.downloads.search({}));
    expect(JSON.parse(await readFile(download.filename, "utf8")).windows[0].ungroupedTabs).toHaveLength(10000);
  } finally { await app.close(); }
});

test("individual choices survive window changes and refresh; group checkbox is mixed and export contains only choices", async () => {
  const app = await launchExtension();
  try {
    await expect(app.popup.locator('#tab-count')).toHaveText('4');
    const spec = app.popup.getByRole('checkbox', { name: 'Specifications [draft] & examples', exact: true });
    const group = app.popup.getByRole('checkbox', { name: 'Research [2026]', exact: true });
    await spec.uncheck();
    await expect(app.popup.locator('#tab-count')).toHaveText('3');
    expect(await group.evaluate((input) => input.indeterminate)).toBe(true);
    await app.popup.locator('#window-picker > summary').click();
    await app.popup.locator(`input[data-window-id="${app.firstWindowId}"]`).uncheck();
    await app.popup.locator(`input[data-window-id="${app.secondWindowId}"]`).check();
    await expect(app.popup.locator('#tab-count')).toHaveText('3');
    await app.popup.locator(`input[data-window-id="${app.firstWindowId}"]`).check();
    await app.popup.locator('#window-picker > summary').click();
    await expect(app.popup.locator('#tab-count')).toHaveText('6');
    await expect(spec).not.toBeChecked();
    await app.popup.locator('#include-ungrouped').uncheck();
    await expect(app.popup.locator('#tab-count')).toHaveText('4');
    await app.popup.locator('#include-ungrouped').check();
    await app.popup.locator('#refresh').click();
    await expect(app.popup.locator('#tab-count')).toHaveText('6');
    await expect(spec).not.toBeChecked();
    await group.check();
    await expect(app.popup.locator('#tab-count')).toHaveText('7');
    await group.uncheck();
    await expect(app.popup.locator('#tab-count')).toHaveText('5');
    await app.popup.locator('#export-json').click();
    await expect.poll(async () => app.worker.evaluate(async () => (await chrome.downloads.search({}))[0]?.state)).toBe('complete');
    const [download] = await app.worker.evaluate(() => chrome.downloads.search({}));
    const payload = JSON.parse(await readFile(download.filename, 'utf8'));
    expect(payload.scope).toBe('selected');
    const titles = payload.windows.flatMap((win) => [...win.groups.flatMap((entry) => entry.tabs), ...win.ungroupedTabs]).map((tab) => tab.title);
    expect(titles).toHaveLength(5);
    expect(titles).not.toContain('Specifications [draft] & examples');
    expect(titles).not.toContain('Tab groups — research notes');
    expect(JSON.stringify(payload)).not.toMatch(/"id"|"tabIds"|"windowIds"/);
  } finally { await app.close(); }
});

test("settings language persists, updates open pages and controls Markdown export", async () => {
  const app = await launchExtension();
  try {
    await expect(app.popup.locator('#tab-count')).toHaveText('4');
    await app.popup.getByRole('checkbox', { name: 'Specifications [draft] & examples', exact: true }).uncheck();
    const settings = await app.context.newPage();
    await settings.goto(`${app.url}options.html`);
    await settings.locator('#language').selectOption('zh_CN');
    await expect(settings.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(settings.locator('#settings-status')).toHaveText('语言已保存在本机。');
    await expect(app.popup.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(app.popup.locator('.section-heading h2')).toHaveText('选择标签页');
    await expect(app.popup.locator('#tab-count')).toHaveText('3');
    const about = await app.context.newPage();
    await about.goto(`${app.url}about.html`);
    await expect(about.locator('.footer')).toContainText('Chai Wang');
    await expect(about.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await settings.reload();
    await expect(settings.locator('#language')).toHaveValue('zh_CN');
    await app.popup.locator('#export-markdown').click();
    await expect.poll(async () => app.worker.evaluate(async () => (await chrome.downloads.search({}))[0]?.state)).toBe('complete');
    const [download] = await app.worker.evaluate(() => chrome.downloads.search({}));
    expect(await readFile(download.filename, 'utf8')).toContain('# Chrome 标签页导出');
    await settings.locator('#language').selectOption('en');
    await expect(app.popup.locator('html')).toHaveAttribute('lang', 'en');
    await expect(about.locator('html')).toHaveAttribute('lang', 'en');
    await app.popup.reload();
    await expect(app.popup.locator('html')).toHaveAttribute('lang', 'en');
    await expect(app.popup.locator('#tab-count')).toHaveText('4');
    expect(await settings.evaluate(() => Object.keys(localStorage))).toEqual(['interfaceLanguage']);
  } finally { await app.close(); }
});

test("10,000 selectable tabs and 1,000 windows remain reachable with bounded rendered rows", async () => {
  const app = await launchExtension();
  try {
    await expect(app.popup.locator('#tab-count')).toHaveText('4');
    await app.popup.evaluate((currentId) => {
      chrome.windows.getAll = async () => [{ id: currentId, type: 'normal', focused: true }];
      chrome.tabs.query = async () => Array.from({ length: 10000 }, (_, n) => ({ id: n + 10000, index: n, groupId: 7000, title: `Single group tab ${n + 1}`, url: 'https://example.com/demo' }));
      chrome.tabGroups.query = async () => [{ id: 7000, title: 'Large group', color: 'blue', collapsed: false }];
    }, app.firstWindowId);
    await app.popup.locator('#refresh').click();
    await expect(app.popup.locator('#tab-count')).toHaveText('10000');
    expect(await app.popup.locator('#preview input').count()).toBeLessThan(25);
    await app.popup.locator('#preview input').first().focus();
    await app.popup.keyboard.press('End');
    const singleLast = app.popup.getByRole('checkbox', { name: 'Single group tab 10000', exact: true });
    await expect(singleLast).toBeFocused();
    await app.popup.keyboard.press('Space');
    await expect(app.popup.locator('#tab-count')).toHaveText('9999');
    await app.popup.keyboard.press('Space');
    await expect(app.popup.locator('#tab-count')).toHaveText('10000');
    await app.popup.evaluate((currentId) => {
      const windows = Array.from({ length: 1000 }, (_, n) => ({ id: currentId + n, type: 'normal', focused: n === 0 }));
      chrome.windows.getAll = async () => windows;
      chrome.tabs.query = async ({ windowId }) => Array.from({ length: 10 }, (_, n) => ({ id: (windowId - currentId) * 10 + n + 10000, index: n, groupId: -1, title: `Synthetic tab ${(windowId - currentId) * 10 + n + 1}`, url: 'https://example.com/demo' }));
      chrome.tabGroups.query = async () => [];
    }, app.firstWindowId);
    await app.popup.locator('#refresh').click();
    await expect(app.popup.locator('#tab-count')).toHaveText('10');
    await selectAllWindows(app);
    await expect(app.popup.locator('#window-count')).toHaveText('1000');
    await expect(app.popup.locator('#tab-count')).toHaveText('10000');
    expect(await app.popup.locator('#preview input').count()).toBeLessThan(25);
    await app.popup.locator('#preview input').first().focus();
    await app.popup.keyboard.press('End');
    const last = app.popup.getByRole('checkbox', { name: 'Synthetic tab 10000', exact: true });
    await expect(last).toBeFocused();
    await app.popup.keyboard.press('Space');
    await expect(last).not.toBeChecked();
    await expect(app.popup.locator('#tab-count')).toHaveText('9999');
    await app.popup.locator('#window-picker > summary').click();
    expect(await app.popup.locator('#window-list input').count()).toBeLessThan(15);
    await app.popup.locator('#window-list input').first().focus();
    await app.popup.keyboard.press('End');
    await expect(app.popup.locator('#window-list .window-row').last()).toContainText('Window 1000');
    await app.popup.keyboard.press('Space');
    await expect(app.popup.locator('#window-count')).toHaveText('999');
    await app.popup.keyboard.press('Space');
    await expect(app.popup.locator('#tab-count')).toHaveText('9999');
  } finally { await app.close(); }
});

test("refresh read failure disables stale export and can recover", async () => {
  const app = await launchExtension();
  try {
    await expect(app.popup.locator('#tab-count')).toHaveText('4');
    await app.popup.evaluate(() => {
      const original = chrome.windows.getAll.bind(chrome.windows);
      let fail = true;
      chrome.windows.getAll = async (options) => { if (fail) { fail = false; throw Error('read failed'); } return original(options); };
    });
    await app.popup.locator('#refresh').click();
    await expect(app.popup.locator('#status')).toContainText('Unable to read');
    await expect(app.popup.locator('#export-json')).toBeDisabled();
    await expect(app.popup.locator('#all-tabs')).toBeDisabled();
    await app.popup.locator('#refresh').click();
    await expect(app.popup.locator('#export-json')).toBeEnabled();
  } finally { await app.close(); }
});

test('native Chrome options modal keeps English and Chinese within the same viewport without scrollbars', async () => {
  const app = await launchExtension({ viewport: null });
  try {
    const { openEmbeddedOptions } = await import('./embedded-options-helper.mjs');
    const options = await openEmbeddedOptions(app);
    const initial = await options.metrics();
    expect(initial.width).toBe(440);
    expect(initial.height).toBe(292);
    for (const [value, language, message] of [['zh_CN', 'zh-CN', '语言已保存在本机。'], ['en', 'en', 'Language saved on this device.'], ['auto', 'en', 'Language saved on this device.']]) {
      await options.setLanguage(value);
      const metrics = await options.metrics();
      expect(metrics.language).toBe(language);
      expect(metrics.status).toBe(message);
      expect(metrics.width).toBe(initial.width);
      expect(metrics.height).toBe(initial.height);
      expect(metrics.contentHeight).toBe(initial.contentHeight);
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width);
      expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.height);
      expect(metrics.selectRight).toBeLessThanOrEqual(metrics.width);
      expect(metrics.footerBottom).toBeLessThanOrEqual(metrics.height);
    }
  } finally { await app.close(); }
});
