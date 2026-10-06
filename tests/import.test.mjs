import test from "node:test";
import assert from "node:assert/strict";
import { parseImport, importRows } from "../extension/lib/import.js";
import { restoreImport } from "../extension/lib/restore.js";
import { exportPayload } from "../extension/lib/format.js";

const minimal = () => ({ windows: [{ groups: [{ tabs: [{ url: "https://example.com/a?token=full&x=1" }, { url: "https://example.com/a?token=full&x=1" }] }], ungroupedTabs: [{ url: "https://example.org/中文", title: "中文 <script>" }] }] });

test("import accepts real version 1 exports and minimal required fields with defaults", () => {
  const plan = parseImport(minimal());
  assert.deepEqual(plan.counts, { windows: 1, groups: 1, tabs: 3, skipped: 0 });
  assert.deepEqual(plan.windows[0].groups[0].group, { title: "", color: "grey", collapsed: false });
  assert.equal(plan.windows[0].groups[0].tabs[0].url, plan.windows[0].groups[0].tabs[1].url);
  const exported = exportPayload(plan.windows, { scope: "selected", includeUngrouped: true });
  assert.deepEqual(parseImport(JSON.stringify(exported)).counts, plan.counts);
  assert.equal(parseImport('\uFEFF' + JSON.stringify(exported)).windows[0].ungroupedTabs[0].title, "中文 <script>");
  const ids = parseImport({ ...exported, schemaVersion: undefined, windows: [{ ...exported.windows[0], id: 88, type: "incognito" }] });
  assert.equal(ids.windows[0].id, undefined);
});

test("invalid required structure or optional types reject the entire import before restoring", () => {
  for (const [data, path] of [
    [[], "root"], [{}, "windows"], [{ windows: {} }, "windows"], [{ windows: [{}] }, "windows[0]"],
    [{ windows: [{ groups: null }] }, "windows[0].groups"],
    [{ windows: [{ ungroupedTabs: null }] }, "windows[0].ungroupedTabs"],
    [{ windows: [{ ungroupedTabs: [{ title: "missing url" }] }] }, "windows[0].ungroupedTabs[0].url"],
    [{ windows: [{ ungroupedTabs: [{ url: 42 }] }] }, "windows[0].ungroupedTabs[0].url"],
    [{ windows: [{ ungroupedTabs: [{ url: "https://example.org", title: null }] }] }, "windows[0].ungroupedTabs[0].title"],
    [{ windows: [{ groups: [{ group: null, tabs: [] }] }] }, "windows[0].groups[0].group"],
    [{ windows: [{ groups: [{ tabs: {} }] }] }, "windows[0].groups[0].tabs"],
    [{ windows: [{ groups: [{ group: { color: "black" }, tabs: [] }] }] }, "windows[0].groups[0].group.color"],
    [{ windows: [{ groups: [{ group: { collapsed: "false" }, tabs: [] }] }] }, "windows[0].groups[0].group.collapsed"]
  ]) assert.throws(() => parseImport(data), (error) => error.code === "importStructureError" && error.path === path);
  assert.throws(() => parseImport('{"windows":'), (error) => error.code === "importJsonError");
  assert.throws(() => parseImport({ schemaVersion: 2, windows: [] }), (error) => error.code === "importVersionError");
});

test("unopenable and executable URLs are skipped, not executed; web queries and local URLs stay intact", () => {
  const urls = ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "chrome-extension://abc/page.html", "chrome://quit", "chrome://restart", "chrome://crash", "mailto:a@example.com", "", "relative/path", "https://example.com/a?q=私人&token=keep", "file:///tmp/local.html", "chrome://settings/privacy", "about:blank"];
  const plan = parseImport({ windows: [{ ungroupedTabs: urls.map((url) => ({ url })) }] });
  assert.equal(plan.counts.skipped, 9);
  assert.deepEqual(plan.windows[0].ungroupedTabs.map((tab) => tab.url), urls.slice(9));
  assert.equal(parseImport({ windows: [{ groups: [], ungroupedTabs: [] }] }).counts.tabs, 0);
  const skipped = parseImport({ windows: [{ ungroupedTabs: Array.from({ length: 100 }, () => ({ url: "data:text/html,test" })) }] });
  assert.equal(skipped.counts.skipped, 100);
  assert.equal(skipped.issues.length, 20);
  assert.equal(skipped.counts.windows, 0);
});

function mockBrowser({ tabFailure = "", windowFailure = false, groupFailure = false } = {}) {
  const calls = [], tabs = [], groups = [];
  let nextId = 100, nextWindow = 20;
  return {
    calls, createdTabs: tabs, groups,
    windows: {
      get: async (id) => ({ id, type: "normal", incognito: false }),
      create: async (options) => {
        calls.push(["window", options]);
        if (windowFailure) throw Error("window creation denied");
        return { id: nextWindow++, tabs: [{ id: nextId++ }] };
      },
      remove: async (id) => calls.push(["removeWindow", id])
    },
    tabs: {
      create: async (options) => {
        calls.push(["tab", options]);
        if (options.url === tabFailure) throw Error("navigation denied");
        const tab = { ...options, id: nextId++ }; tabs.push(tab); return tab;
      },
      group: async (options) => {
        calls.push(["group", options]);
        if (groupFailure) throw Error("group denied");
        const group = { id: nextId++, options }; groups.push(group); return group.id;
      },
      remove: async (id) => calls.push(["removeTab", id])
    },
    tabGroups: { update: async (id, options) => { calls.push(["metadata", id, options]); return { id, ...options }; } }
  };
}

test("restore preserves file windows, duplicate tabs, group order and metadata without modifying existing tabs", async () => {
  const payload = minimal();
  payload.windows[0].groups[0].group = { title: "Research", color: "green", collapsed: true };
  payload.windows.push({ ungroupedTabs: [{ url: "https://example.org/second" }] });
  const api = mockBrowser();
  const result = await restoreImport(parseImport(payload), { mode: "new" }, api);
  assert.deepEqual([result.state, result.opened, result.windows, result.groups, result.failed], ["complete", 4, 2, 1, 0]);
  assert.deepEqual(api.calls.filter(([type]) => type === "tab").map(([, options]) => [options.windowId, options.url, options.active]), [
    [20, "https://example.com/a?token=full&x=1", false], [20, "https://example.com/a?token=full&x=1", false], [20, "https://example.org/中文", false], [21, "https://example.org/second", false]
  ]);
  assert.deepEqual(api.groups[0].options.createProperties, { windowId: 20 });
  assert.deepEqual(api.calls.filter(([type]) => type === "metadata").map((call) => call[2]), [{ title: "Research", color: "green" }, { collapsed: true }]);
  assert.equal(api.calls.filter(([type]) => type === "removeTab").length, 2);
  const append = mockBrowser();
  const merged = await restoreImport(parseImport(payload), { mode: "current", windowId: 5 }, append);
  assert.equal(merged.windows, 1);
  assert.ok(append.calls.filter(([type]) => type === "tab").every(([, tab]) => tab.windowId === 5));
  assert.ok(!append.calls.some(([type]) => ["window", "removeTab", "removeWindow"].includes(type)));
});

test("partial creation and grouping failures are reported accurately; empty temporary windows are cleaned up", async () => {
  const api = mockBrowser({ tabFailure: "https://example.org/中文", groupFailure: true });
  const result = await restoreImport(parseImport(minimal()), { mode: "new" }, api);
  assert.deepEqual([result.opened, result.failed, result.groupErrors, result.groups, result.processed], [2, 1, 1, 0, 3]);
  assert.equal(result.issues.length, 2);
  const none = mockBrowser({ windowFailure: true });
  const failed = await restoreImport(parseImport(minimal()), { mode: "new" }, none);
  assert.deepEqual([failed.opened, failed.failed, failed.processed], [0, 3, 3]);
  const empty = mockBrowser({ tabFailure: "https://example.com/fail" });
  await restoreImport(parseImport({ windows: [{ ungroupedTabs: [{ url: "https://example.com/fail" }] }] }), { mode: "new" }, empty);
  assert.ok(empty.calls.some(([type]) => type === "removeWindow"));
});

test("stopping restoration keeps opened tabs grouped and leaves the remainder unattempted", async () => {
  const api = mockBrowser();
  let stop = false;
  const result = await restoreImport(parseImport(minimal()), { mode: "new" }, api, { cancelled: () => stop, progress: (state) => { if (state.opened === 1) stop = true; } });
  assert.deepEqual([result.state, result.opened, result.failed, result.processed, result.groups], ["cancelled", 1, 0, 1, 1]);
  assert.equal(api.calls.filter(([type]) => type === "tab").length, 1);
  const incognito = mockBrowser();
  incognito.windows.get = async () => ({ id: 5, type: "normal", incognito: true });
  await assert.rejects(() => restoreImport(parseImport(minimal()), { mode: "current", windowId: 5 }, incognito));
  assert.deepEqual(incognito.calls, []);
});

test("import handles 1,000 windows and 10,000 URLs without an artificial tab count cap", () => {
  const plan = parseImport({ windows: Array.from({ length: 1000 }, () => ({ ungroupedTabs: Array.from({ length: 10 }, (_, n) => ({ url: `https://example.com/${n}` })) })) });
  assert.equal(plan.counts.tabs, 10000);
  assert.equal(plan.counts.windows, 1000);
  assert.equal(importRows(plan).length, 12000);
});
