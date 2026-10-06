export function validateOptions(options) {
  if (!options || !["current", "all", "selected"].includes(options.scope) || typeof options.includeUngrouped !== "boolean") {
    throw new TypeError("Invalid export options");
  }
  if (options.scope === "current" && !Number.isInteger(options.windowId)) {
    throw new TypeError("A current window is required");
  }
  if (options.scope === "selected") {
    for (const key of ["windowIds", "tabIds"]) {
      if (!Array.isArray(options[key]) || options[key].some((id) => !Number.isSafeInteger(id) || id < 0)) throw new TypeError("Invalid selection");
    }
  }
  return options;
}

export function plainTab(tab) {
  return { title: String(tab.title ?? ""), url: String(tab.url || tab.pendingUrl || "") };
}

export function plainWindows(windows) {
  return windows.map((win) => ({
    groups: win.groups.map((entry) => ({
      group: {
        title: String(entry.group.title ?? ""),
        color: String(entry.group.color ?? "grey"),
        collapsed: Boolean(entry.group.collapsed)
      },
      tabs: entry.tabs.map(plainTab)
    })),
    ungroupedTabs: win.ungroupedTabs.map(plainTab)
  }));
}

export async function collectSnapshot(options = { scope: "all", includeUngrouped: true }, api = chrome) {
  validateOptions(options);
  let windows = options.scope !== "current"
    ? await api.windows.getAll({ windowTypes: ["normal"] })
    : [await api.windows.get(options.windowId)];
  const selectedWindows = options.scope === "selected" ? new Set(options.windowIds) : null;
  const selectedTabs = options.scope === "selected" ? new Set(options.tabIds) : null;
  if (selectedWindows) windows = windows.filter((win) => selectedWindows.has(win.id));
  const ownPrefix = api.runtime.getURL("");
  const result = [];
  windows.sort((a, b) => Number(b.focused) - Number(a.focused) || a.id - b.id);

  for (const win of windows) {
    if (win.type !== "normal" || win.incognito) continue;
    let tabs, groups;
    try {
      [tabs, groups] = await Promise.all([
        api.tabs.query({ windowId: win.id }),
        api.tabGroups.query({ windowId: win.id })
      ]);
    } catch (error) {
      // A window may close between enumeration and reading. Do not hide other API errors.
      try { await api.windows.get(win.id); } catch { continue; }
      throw error;
    }
    const byId = new Map(groups.map((group) => [group.id, group]));
    const grouped = new Map();
    const ungroupedTabs = [];
    const orderedTabs = tabs.filter((tab) => !tab.incognito && (!selectedTabs || selectedTabs.has(tab.id)) && !String(tab.url || tab.pendingUrl || "").startsWith(ownPrefix))
      .sort((a, b) => a.index - b.index);
    for (const tab of orderedTabs) {
      if (tab.groupId >= 0) {
        if (!grouped.has(tab.groupId)) grouped.set(tab.groupId, []);
        grouped.get(tab.groupId).push({ id: tab.id, ...plainTab(tab) });
      } else if (options.includeUngrouped) {
        ungroupedTabs.push({ id: tab.id, ...plainTab(tab) });
      }
    }
    const entries = Array.from(grouped, ([id, groupTabs]) => ({
      group: { id, title: "", color: "grey", collapsed: false, ...byId.get(id) },
      tabs: groupTabs
    }));
    result.push({ id: win.id, groups: entries, ungroupedTabs });
  }
  return result;
}

export async function collectData(options, api = chrome) {
  const windows = await collectSnapshot(options, api);
  return plainWindows(options.scope === "selected" ? windows.filter((win) => win.groups.length || win.ungroupedTabs.length) : windows);
}

export function summarize(windows) {
  return windows.reduce((total, win) => ({
    windows: total.windows + 1,
    groups: total.groups + win.groups.length,
    tabs: total.tabs + win.ungroupedTabs.length + win.groups.reduce((sum, group) => sum + group.tabs.length, 0)
  }), { windows: 0, groups: 0, tabs: 0 });
}
