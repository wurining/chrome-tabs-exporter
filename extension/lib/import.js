const colors = new Set(["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"]);
const chromePages = new Set(["newtab", "settings", "extensions", "downloads", "history", "bookmarks", "version", "flags"]);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export class ImportValidationError extends Error {
  constructor(code, path = "") { super(code); this.code = code; this.path = path; }
}

// Only navigation URLs are accepted. Imported files cannot run javascript/data
// URLs, open another extension, or invoke chrome://quit/restart.
export function importUrl(value) {
  const url = value.trim();
  let parsed;
  try { parsed = new URL(url); } catch { return { reason: "importInvalidUrl" }; }
  if (["http:", "https:"].includes(parsed.protocol) && parsed.hostname) return { url };
  if (parsed.protocol === "file:" && parsed.pathname.startsWith("/")) return { url };
  if (url === "about:blank") return { url };
  if (parsed.protocol === "chrome:" && chromePages.has(parsed.hostname) && !parsed.username && !parsed.password && !parsed.port) return { url };
  return { reason: "importUnsupportedUrl" };
}

// Validate structural fields before opening anything. Ignore unknown metadata
// (including old browser IDs); use defaults for missing optional fields.
export function parseImport(input) {
  let data = input;
  if (typeof input === "string") {
    try { data = JSON.parse(input.replace(/^\uFEFF/, "")); }
    catch { throw new ImportValidationError("importJsonError"); }
  }
  const fail = (path) => { throw new ImportValidationError("importStructureError", path); };
  if (!object(data)) fail("root");
  if (data.schemaVersion !== undefined && data.schemaVersion !== 1) throw new ImportValidationError("importVersionError", "schemaVersion");
  if (!Array.isArray(data.windows)) fail("windows");
  const counts = { windows: 0, groups: 0, tabs: 0, skipped: 0 };
  const issues = [];
  const readTabs = (entries, path) => {
    if (!Array.isArray(entries)) fail(path);
    const tabs = [];
    entries.forEach((entry, index) => {
      const location = `${path}[${index}]`;
      if (!object(entry) || typeof entry.url !== "string") fail(`${location}.url`);
      if (entry.title !== undefined && typeof entry.title !== "string") fail(`${location}.title`);
      const result = importUrl(entry.url);
      if (!result.url) {
        counts.skipped++;
        if (issues.length < 20) issues.push({ path: `${location}.url`, reason: result.reason });
        return;
      }
      counts.tabs++;
      tabs.push({ url: result.url, title: entry.title ?? "", path: location });
    });
    return tabs;
  };
  const windows = [];
  data.windows.forEach((win, index) => {
    const path = `windows[${index}]`;
    if (!object(win) || (win.groups === undefined && win.ungroupedTabs === undefined)) fail(path);
    if (win.groups !== undefined && !Array.isArray(win.groups)) fail(`${path}.groups`);
    if (win.ungroupedTabs !== undefined && !Array.isArray(win.ungroupedTabs)) fail(`${path}.ungroupedTabs`);
    const groups = [];
    (win.groups ?? []).forEach((entry, groupIndex) => {
      const location = `${path}.groups[${groupIndex}]`;
      if (!object(entry)) fail(location);
      const meta = entry.group ?? {};
      if (entry.group !== undefined && !object(entry.group)) fail(`${location}.group`);
      if (meta.title !== undefined && typeof meta.title !== "string") fail(`${location}.group.title`);
      if (meta.color !== undefined && !colors.has(meta.color)) fail(`${location}.group.color`);
      if (meta.collapsed !== undefined && typeof meta.collapsed !== "boolean") fail(`${location}.group.collapsed`);
      const tabs = readTabs(entry.tabs, `${location}.tabs`);
      if (tabs.length) {
        counts.groups++;
        groups.push({ group: { title: meta.title ?? "", color: meta.color ?? "grey", collapsed: meta.collapsed ?? false }, tabs, path: location });
      }
    });
    const ungroupedTabs = readTabs(win.ungroupedTabs ?? [], `${path}.ungroupedTabs`);
    if (groups.length || ungroupedTabs.length) {
      counts.windows++;
      windows.push({ groups, ungroupedTabs, path, number: index + 1 });
    }
  });
  return { windows, counts, issues };
}

export function importRows(plan) {
  const rows = [];
  for (const win of plan.windows) {
    rows.push({ type: "heading", number: win.number });
    win.groups.forEach((entry, index) => {
      rows.push({ type: "group", title: entry.group.title, color: entry.group.color, number: index + 1, count: entry.tabs.length });
      entry.tabs.forEach((tab) => rows.push({ type: "tab", tab }));
    });
    if (win.ungroupedTabs.length) {
      rows.push({ type: "ungrouped", count: win.ungroupedTabs.length });
      win.ungroupedTabs.forEach((tab) => rows.push({ type: "tab", tab }));
    }
  }
  return rows;
}
