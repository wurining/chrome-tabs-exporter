import test from "node:test";
import assert from "node:assert/strict";
import { collectData, collectSnapshot, summarize, plainWindows } from "../extension/lib/data.js";
import { TabSelection } from "../extension/lib/selection.js";
import { formatJson, formatMarkdown, markdownTab } from "../extension/lib/format.js";
import { downloadExport } from "../extension/lib/download.js";
import { LatestRequest } from "../extension/lib/preview.js";
import { supportChannels } from "../extension/lib/support.js";
import { translator } from "./helpers.mjs";

const date = new Date("2026-10-06T12:00:00Z");
const options = { scope: "all", includeUngrouped: true };
const tab = (overrides = {}) => ({ id: 99, index: 0, groupId: -1, title: "Notes", url: "https://example.com/notes?token=demo", favIconUrl: "https://example.com/favicon.ico", audible: true, ...overrides });
const windows = [{ groups: [{ group: { id: 42, title: "Research [draft]", color: "blue", collapsed: true }, tabs: [tab()] }], ungroupedTabs: [tab({ url: "chrome://settings", index: 1 })] }];
function apiFixture() {
  const wins = [{ id: 1, type: "normal", focused: true }, { id: 2, type: "normal", incognito: true }, { id: 3, type: "popup" }, { id: 4, type: "normal" }];
  return {
    runtime: { getURL: () => "chrome-extension://test/" },
    windows: { getAll: async () => wins, get: async (id) => { const w = wins.find((win) => win.id === id); if (!w) throw Error("gone"); return w; } },
    tabs: { query: async ({ windowId }) => windowId === 1 ? [tab({ index: 3 }), tab({ groupId: 7, index: 2, title: "Second" }), tab({ groupId: 7, index: 1, title: "First" }), tab({ index: 4, url: "chrome-extension://test/about.html" }), tab({ incognito: true })] : [] },
    tabGroups: { query: async () => [{ id: 7, title: "", color: "purple", collapsed: false }] }
  };
}
test("JSON strips browser metadata and keeps complete URLs and portable group metadata", () => {
  const data = JSON.parse(formatJson(windows, options, date));
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.exportedAt, date.toISOString());
  assert.deepEqual(data.windows[0].groups[0].tabs[0], { title: "Notes", url: "https://example.com/notes?token=demo" });
  assert.deepEqual(data.windows[0].groups[0].group, { title: "Research [draft]", color: "blue", collapsed: true });
  assert.ok(!/favIconUrl|audible|"id"/.test(JSON.stringify(data)));
});
test("reader excludes incognito, non-normal windows and own pages, preserving tab order", async () => {
  const data = await collectData(options, apiFixture());
  assert.deepEqual(summarize(data), { windows: 2, groups: 1, tabs: 3 });
  assert.deepEqual(data[0].groups[0].tabs.map((item) => item.title), ["First", "Second"]);
  assert.deepEqual(data, plainWindows(data));
  assert.equal(summarize(await collectData({ scope: "current", includeUngrouped: false, windowId: 1 }, apiFixture())).tabs, 2);
});
test("closed windows are skipped; API failures in existing windows are surfaced", async () => {
  const api = apiFixture();
  api.tabs.query = async () => { throw Error("read failed"); };
  api.windows.get = async () => { throw Error("closed"); };
  assert.equal((await collectData(options, api)).length, 0);
  api.windows.get = async () => ({ id: 1 });
  await assert.rejects(collectData(options, api), /read failed/);
});
test("missing group metadata and pending URL are handled without retaining browser objects", async () => {
  const api = apiFixture();
  api.tabGroups.query = async () => [];
  api.tabs.query = async () => [tab({ groupId: 7, url: "", pendingUrl: "https://example.org/new" })];
  const data = await collectData({ scope: "current", includeUngrouped: true, windowId: 1 }, api);
  assert.deepEqual(data[0].groups[0].group, { title: "", color: "grey", collapsed: false });
  assert.equal(data[0].groups[0].tabs[0].url, "https://example.org/new");
});
test("Markdown safely renders brackets, HTML, backslashes, whitespace and URL parentheses", async () => {
  const line = markdownTab({ title: "[v2] *draft* <img>\n", url: "https://example.org/a)b?q=<one two>" }, "Untitled");
  assert.equal(line, "[\\[v2\\] \\*draft\\* &lt;img&gt; ](<https://example.org/a)b?q=%3Cone%20two%3E>)");
  for (const url of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "chrome://settings", "file:///private/file", "custom:`code`"] ) {
    assert.ok(!markdownTab({ title: "Title", url }, "Untitled").includes("]("));
  }
  assert.match(formatMarkdown(windows, options, await translator("zh_CN"), date), /Chrome 标签页导出/);
});
test("export uses a self-contained Unicode data URL and reports only initiation", async () => {
  let request;
  const result = await downloadExport([{ groups: [], ungroupedTabs: [tab({ title: "中文 ☕" })] }], options, "json", await translator(), { downloads: { download: async (value) => { request = value; return 123; } } }, date);
  assert.deepEqual(result, { state: "started", downloadId: 123 });
  assert.ok(request.saveAs);
  assert.match(request.filename, /^chrome-tabs-all-20261006T120000Z\.json$/);
  assert.match(decodeURIComponent(request.url.split(",").slice(1).join(",")), /中文 ☕/);
});
test("canceled or failed saves never produce a started state; empty export does not download", async () => {
  const api = { downloads: { download: async () => { throw Error("canceled"); } } };
  await assert.rejects(downloadExport(windows, options, "json", await translator(), api), /canceled/);
  api.downloads.download = async () => undefined;
  await assert.rejects(downloadExport(windows, options, "json", await translator(), api), /not started/);
  assert.deepEqual(await downloadExport([], options, "json", await translator(), api), { state: "empty" });
});
test("large exports retain every tab", async () => {
  const data = [{ groups: [], ungroupedTabs: Array.from({ length: 10000 }, (_, index) => tab({ title: `Tab ${index}` })) }];
  assert.equal(JSON.parse(formatJson(data, options, date)).windows[0].ungroupedTabs.length, 10000);
  const markdown = formatMarkdown(data, options, await translator(), date);
  assert.match(markdown, /10000\. \[Tab 9999\]/);
});
test("old preview requests cannot overwrite newer selections", () => {
  const requests = new LatestRequest();
  const first = requests.next();
  const second = requests.next();
  assert.equal(first(), false);
  assert.equal(second(), true);
});
test("sponsor channels reject remote images, traversal, spoofed hosts and unconfigured QR", () => {
  assert.deepEqual(supportChannels({}), { coffeeUrl: "", coffeeQr: "", wechatQr: "", alipayQr: "" });
  assert.equal(supportChannels({ buyMeACoffeeUrl: "https://buymeacoffee.com/example", buyMeACoffeeQr: "assets/support/coffee.png" }).coffeeQr, "assets/support/coffee.png");
  for (const url of ["http://buymeacoffee.com/example", "https://buymeacoffee.com.evil.test/example", "https://user@buymeacoffee.com/example", "https://buymeacoffee.com/example?tabs=secret"]) assert.equal(supportChannels({ buyMeACoffeeUrl: url }).coffeeUrl, "");
  for (const path of ["https://example.com/code.png", "assets/support/../secret.png", "assets/support/fake.svg"]) assert.equal(supportChannels({ wechatQr: path }).wechatQr, "");
});

test("window, group and individual selection survives scope and refresh; closed tabs are removed", () => {
  const model = new TabSelection();
  const first = { id: 1, groups: [{ group: { id: 7, title: "Group" }, tabs: [tab({ id: 10 }), tab({ id: 11 })] }], ungroupedTabs: [tab({ id: 12 })] };
  const second = { id: 2, groups: [], ungroupedTabs: [tab({ id: 20 })] };
  model.reconcile([first, second], 1);
  assert.deepEqual(model.counts(true), { windows: 1, groups: 1, tabs: 3 });
  model.setTabs([{ id: 11 }], false);
  assert.deepEqual(model.state(first.groups[0].tabs), { checked: false, mixed: true, selected: 1, total: 2 });
  model.setWindow(1, false);
  model.setWindow(2, true);
  model.setWindow(1, true);
  assert.deepEqual(model.exportOptions(true).tabIds, [10, 12, 20]);
  assert.equal(model.exportOptions(false).tabIds.includes(12), false);
  assert.equal(model.exportOptions(true).tabIds.includes(12), true);
  model.setTabs(first.groups[0].tabs, true);
  assert.equal(model.state(first.groups[0].tabs).checked, true);
  model.setTabs([{ id: 11 }], false);
  model.reconcile([first, second], 2);
  assert.equal(model.isSelected({ id: 11 }), false);
  const changed = { ...first, groups: [{ ...first.groups[0], tabs: [tab({ id: 10 }), tab({ id: 13 })] }] };
  model.reconcile([changed, { id: 3, groups: [], ungroupedTabs: [tab({ id: 30 })] }], 1);
  assert.equal(model.excludedTabs.has(11), false);
  assert.equal(model.isSelected({ id: 13 }), true);
  assert.equal(model.selectedWindows.has(2), false);
  assert.equal(model.selectedWindows.has(3), false);
});

test("selected export re-reads only selected windows and tabs and never exports browser IDs", async () => {
  const api = apiFixture();
  const queries = [];
  api.tabs.query = async ({ windowId }) => {
    queries.push(windowId);
    return [tab({ id: 10, groupId: 7 }), tab({ id: 11, index: 1 }), tab({ id: 12, index: 2 })];
  };
  const opts = { scope: "selected", includeUngrouped: true, windowIds: [1, 987], tabIds: [10, 12, 9876] };
  const snapshot = await collectSnapshot(opts, api);
  assert.equal(snapshot[0].id, 1);
  assert.deepEqual(snapshot[0].ungroupedTabs.map((item) => item.id), [12]);
  queries.length = 0;
  const data = await collectData(opts, api);
  assert.deepEqual(queries, [1]);
  const payload = JSON.parse(formatJson(data, opts, date));
  assert.equal(payload.scope, "selected");
  assert.equal(summarize(payload.windows).tabs, 2);
  assert.ok(!/"id"|"tabIds"|"windowIds"/.test(JSON.stringify(payload)));
  assert.match(formatMarkdown(data, opts, await translator(), date), /Selected windows and tabs/);
  await assert.rejects(collectData({ ...opts, tabIds: ["10"] }, api), /Invalid selection/);
});

test("selection has no fixed window or tab cap and reaches the last of 10,000 tabs", () => {
  const model = new TabSelection();
  const windows = Array.from({ length: 1000 }, (_, w) => ({ id: w + 1, groups: [], ungroupedTabs: Array.from({ length: 10 }, (_, t) => tab({ id: w * 10 + t + 1001 })) }));
  model.reconcile(windows, 1);
  for (const win of windows) model.setWindow(win.id, true);
  assert.equal(model.exportOptions(true).tabIds.length, 10000);
  model.setTabs([{ id: 11000 }], false);
  assert.equal(model.exportOptions(true).tabIds.length, 9999);
  assert.equal(model.exportOptions(true).tabIds.includes(11000), false);
  assert.equal(model.rows(true).at(-1).tab.id, 11000);
});
