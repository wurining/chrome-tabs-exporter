import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { launchExtension } from "./browser-helper.mjs";

async function openImporter(app) {
  const opened = app.context.waitForEvent("page");
  await app.popup.locator('.import-link').click();
  const importer = await opened;
  await importer.waitForURL(`${app.url}import.html`);
  await importer.setViewportSize({ width: 1000, height: 900 });
  await expect(importer.locator("#import-file")).toBeEnabled();
  return importer;
}
async function upload(page, payload) {
  await page.locator('#import-file').setInputFiles({ name: 'tabs.json', mimeType: 'application/json', buffer: Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)) });
}
const portable = (win) => ({
  groups: win.groups.map((entry) => ({ group: entry.group, urls: entry.tabs.map((tab) => tab.url) })),
  ungrouped: win.ungroupedTabs.map((tab) => tab.url)
});

test("a real exported JSON file reopens closed demo tabs in the same window and group structure", async () => {
  const app = await launchExtension();
  try {
    await expect(app.popup.locator('#tab-count')).toHaveText('4');
    await app.popup.locator('#window-picker > summary').click();
    await app.popup.locator('#all-windows').check();
    await app.popup.locator('#window-picker > summary').click();
    await app.popup.locator('#export-json').click();
    await expect.poll(async () => app.worker.evaluate(async () => (await chrome.downloads.search({}))[0]?.state)).toBe('complete');
    const [download] = await app.worker.evaluate(() => chrome.downloads.search({}));
    const text = await readFile(download.filename, 'utf8');
    const exported = JSON.parse(text);
    const importer = await openImporter(app);
    await app.worker.evaluate(async () => {
      const tabs = (await chrome.tabs.query({})).filter((tab) => tab.url?.startsWith('https:'));
      await chrome.tabs.remove(tabs.map((tab) => tab.id));
    });
    const existingWindows = await app.worker.evaluate(async () => (await chrome.windows.getAll({ windowTypes: ['normal'] })).map((win) => win.id));
    await upload(importer, text);
    await expect(importer.locator('#import-tab-count')).toHaveText('7');
    await expect(importer.locator('#import-group-count')).toHaveText('3');
    await expect(importer.locator('#import-window-count')).toHaveText('2');
    expect(await app.worker.evaluate(() => chrome.tabs.query({ url: 'https://example.com/*' }))).toHaveLength(0);
    await importer.locator('#restore').click();
    await expect(importer.locator('#restore-status')).toHaveText('Restore complete. Tabs opened: 7.');
    await expect(importer.locator('#restore')).toBeDisabled();
    const restored = await importer.evaluate(async (ids) => {
      const { collectData } = await import(chrome.runtime.getURL('lib/data.js'));
      const windowIds = (await chrome.windows.getAll({ windowTypes: ['normal'] })).filter((win) => !ids.includes(win.id)).map((win) => win.id);
      const tabIds = (await chrome.tabs.query({})).filter((tab) => windowIds.includes(tab.windowId)).map((tab) => tab.id);
      return collectData({ scope: 'selected', includeUngrouped: true, windowIds, tabIds });
    }, existingWindows);
    // collectData sorts background windows by browser ID; creation follows file order.
    expect(restored.map(portable)).toEqual(exported.windows.map(portable));
    expect(await importer.evaluate(() => Object.keys(localStorage))).toEqual([]);
  } finally { await app.close(); }
});

test("minimal imports append duplicate URLs with default group metadata and leave existing tabs untouched", async () => {
  const app = await launchExtension();
  try {
    const importer = await openImporter(app);
    const windowId = await importer.evaluate(async () => (await chrome.tabs.getCurrent()).windowId);
    const before = await app.worker.evaluate(async (id) => (await chrome.tabs.query({ windowId: id })).map((tab) => ({ id: tab.id, url: tab.url, groupId: tab.groupId })), windowId);
    const url = 'https://example.com/research?q=中文&full=keep';
    await upload(importer, { windows: [{ groups: [{ tabs: [{ url }, { url }] }] }, { ungroupedTabs: [{ url: 'https://example.org/reference' }] }] });
    await importer.locator('input[value="current"]').check();
    await importer.locator('#restore').click();
    await expect(importer.locator('#restore-status')).toHaveText('Restore complete. Tabs opened: 3.');
    const after = await app.worker.evaluate(async (id) => ({ tabs: await chrome.tabs.query({ windowId: id }), groups: await chrome.tabGroups.query({ windowId: id }) }), windowId);
    expect(after.tabs.filter((tab) => before.some((old) => old.id === tab.id)).map((tab) => ({ id: tab.id, url: tab.url, groupId: tab.groupId }))).toEqual(before);
    const newTabs = after.tabs.filter((tab) => !before.some((old) => old.id === tab.id));
    expect(newTabs.map((tab) => tab.url || tab.pendingUrl)).toEqual([new URL(url).href, new URL(url).href, 'https://example.org/reference']);
    expect(newTabs[0].groupId).toBe(newTabs[1].groupId);
    expect(after.groups.find((group) => group.id === newTabs[0].groupId)).toMatchObject({ title: '', color: 'grey', collapsed: false });
    expect(await app.worker.evaluate(async () => (await chrome.windows.getAll({ windowTypes: ['normal'] })).length)).toBe(2);
  } finally { await app.close(); }
});

test("file validation prevents accidental opens, skipped URLs are visible, preview text is safe and large lists stay bounded", async () => {
  const app = await launchExtension({ locale: 'zh-CN', colorScheme: 'dark' });
  try {
    const importer = await openImporter(app);
    await expect(importer.locator('html')).toHaveAttribute('lang', 'zh-CN');
    const before = await app.worker.evaluate(async () => (await chrome.tabs.query({})).length);
    await upload(importer, '{"windows":');
    await expect(importer.locator('#file-status')).toContainText('JSON 无法解析');
    await expect(importer.locator('#restore-section')).toBeHidden();
    await upload(importer, { windows: [{ ungroupedTabs: [{ title: 'missing' }] }] });
    await expect(importer.locator('#file-status')).toContainText('windows[0].ungroupedTabs[0].url');
    await upload(importer, { schemaVersion: 2, windows: [] });
    await expect(importer.locator('#file-status')).toContainText('schemaVersion');
    await upload(importer, { windows: [{ ungroupedTabs: [{ url: 'javascript:alert(1)' }, { url: 'chrome://quit' }] }] });
    await expect(importer.locator('#restore')).toBeDisabled();
    await expect(importer.locator('#warning-summary')).toContainText('2');
    const entries = Array.from({ length: 10000 }, (_, n) => ({ url: `https://example.com/${n}`, title: n === 0 ? '<img src=x onerror=alert(1)>' : `中文标签页 ${n + 1}` }));
    await upload(importer, { windows: [{ ungroupedTabs: [...entries, { url: 'data:text/html,bad' }] }] });
    await expect(importer.locator('#import-tab-count')).toHaveText('10000');
    await expect(importer.locator('#warning-summary')).toContainText('1');
    await expect(importer.locator('#import-preview')).toContainText('<img src=x onerror=alert(1)>');
    expect(await importer.locator('#import-preview img').count()).toBe(0);
    expect(await importer.locator('#import-preview .select-row').count()).toBeLessThan(20);
    await importer.locator('#import-preview').focus();
    await importer.keyboard.press('End');
    await expect(importer.locator('#import-preview')).toContainText('中文标签页 10000');
    expect(await app.worker.evaluate(async () => (await chrome.tabs.query({})).length)).toBe(before);
    await importer.setViewportSize({ width: 390, height: 844 });
    expect(await importer.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  } finally { await app.close(); }
});

test("restoration survives closing its page, duplicate start requests do not replay and stopping preserves opened tabs", async () => {
  const app = await launchExtension();
  try {
    const importer = await openImporter(app);
    await app.worker.evaluate(() => {
      const create = chrome.tabs.create.bind(chrome.tabs);
      chrome.tabs.create = async (options) => { await new Promise((resolve) => setTimeout(resolve, 150)); return create(options); };
    });
    await importer.evaluate(() => {
      const send = chrome.runtime.sendMessage.bind(chrome.runtime);
      chrome.runtime.sendMessage = (message) => { if (message.type === 'import-start') window.lastRequest = message; return send(message); };
    });
    await upload(importer, { windows: [{ groups: [{ group: { title: 'Stop test', color: 'cyan' }, tabs: Array.from({ length: 20 }, (_, n) => ({ url: `https://example.com/restore-${n}` })) }] }] });
    await importer.locator('#restore').click();
    const duplicate = await importer.evaluate(() => chrome.runtime.sendMessage(window.lastRequest));
    expect(duplicate.ok).toBe(true);
    await importer.close();
    const resumed = await app.context.newPage();
    await resumed.goto(`${app.url}import.html`);
    await expect(resumed.locator('#restore-status')).toContainText('Tabs opened:');
    await resumed.locator('#cancel-restore').click();
    await expect(resumed.locator('#restore-status')).toContainText('Stopped. Tabs kept:');
    const state = await resumed.evaluate(async () => (await chrome.runtime.sendMessage({ type: 'import-status' })).result);
    expect(state.opened).toBeGreaterThan(0);
    expect(state.opened).toBeLessThan(20);
    expect(state.processed).toBe(state.opened);
    expect(state.groups).toBe(1);
    const opened = await app.worker.evaluate(async () => (await chrome.tabs.query({})).filter((tab) => (tab.url || tab.pendingUrl || '').includes('/restore-')));
    expect(opened).toHaveLength(state.opened);
    expect(new Set(opened.map((tab) => tab.groupId)).size).toBe(1);
    const rejected = await app.popup.evaluate(() => chrome.runtime.sendMessage({ type: 'import-start', requestId: 'not-the-import-page', payload: { windows: [] }, mode: 'new' }).catch(() => null));
    expect(rejected).toBeFalsy();
  } finally { await app.close(); }
});

test("individual tab and grouping failures display a partial result and retain successful tabs", async () => {
  const app = await launchExtension();
  try {
    const importer = await openImporter(app);
    await app.worker.evaluate(() => {
      const create = chrome.tabs.create.bind(chrome.tabs);
      chrome.tabs.create = async (options) => { if (options.url.endsWith('/deny')) throw Error('controlled tab failure'); return create(options); };
      chrome.tabs.group = async () => { throw Error('controlled grouping failure'); };
    });
    await upload(importer, { windows: [{ groups: [{ tabs: [{ url: 'https://example.com/research' }, { url: 'https://example.com/deny' }] }] }] });
    await importer.locator('#restore').click();
    await expect(importer.locator('#restore-status')).toContainText('Restore finished with issues. Tabs opened: 1');
    await expect(importer.locator('#restore-details')).toContainText('1 failed tabs · 1 group issues');
    await importer.locator('#restore-errors > summary').click();
    await expect(importer.locator('#restore-error-list')).toContainText('windows[0].groups[0].tabs[1]');
    await expect(importer.locator('#restore')).toBeDisabled();
    await upload(importer, { windows: [{ ungroupedTabs: [{ url: 'https://example.com/reference' }] }] });
    await expect(importer.locator('#restore')).toBeEnabled();
  } finally { await app.close(); }
});

test("a destination window closed during restoration produces a partial report without changing other windows", async () => {
  const app = await launchExtension();
  try {
    const importer = await openImporter(app);
    await app.worker.evaluate(() => {
      const create = chrome.tabs.create.bind(chrome.tabs);
      chrome.tabs.create = async (options) => { await new Promise((resolve) => setTimeout(resolve, 100)); return create(options); };
    });
    await upload(importer, { windows: [{ ungroupedTabs: Array.from({ length: 10 }, (_, n) => ({ url: `https://example.com/window-close-${n}` })) }] });
    await importer.locator('input[value="current"]').check();
    await importer.locator('#restore').click();
    await expect.poll(async () => importer.evaluate(async () => (await chrome.runtime.sendMessage({ type: 'import-status' })).result.opened)).toBeGreaterThan(0);
    const destination = await importer.evaluate(async () => (await chrome.tabs.getCurrent()).windowId);
    await app.worker.evaluate((id) => chrome.windows.remove(id), destination);
    const observer = await app.context.newPage();
    await observer.goto(`${app.url}import.html`);
    await expect(observer.locator('#restore-status')).toContainText('Restore finished with issues');
    const result = await observer.evaluate(async () => (await chrome.runtime.sendMessage({ type: 'import-status' })).result);
    expect(result.failed).toBeGreaterThan(0);
    expect(result.processed).toBe(10);
    expect(result.opened + result.failed).toBe(10);
    const remaining = await app.worker.evaluate((id) => chrome.tabs.query({ windowId: id }), app.secondWindowId);
    expect(remaining.filter((tab) => (tab.url || '').startsWith('https:'))).toHaveLength(3);
  } finally { await app.close(); }
});
