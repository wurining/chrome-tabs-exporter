// Sequential browser calls preserve ordering without thousands of simultaneous
// requests. Cancellation keeps tabs that have already been opened.
export async function restoreImport(plan, options, api = chrome, control = {}) {
  if (!["new", "current"].includes(options.mode)) throw new TypeError("Invalid restore mode");
  if (options.mode === "current") {
    const win = await api.windows.get(options.windowId);
    if (win.type !== "normal" || win.incognito) throw new TypeError("Invalid target window");
  }
  const result = { state: "running", total: plan.counts.tabs, processed: 0, opened: 0, windows: 0, groups: 0, failed: 0, groupErrors: 0, skipped: plan.counts.skipped, issues: [] };
  const cancelled = () => Boolean(control.cancelled?.());
  const report = () => control.progress?.({ ...result, issues: [...result.issues] });
  const issue = (path, reason) => { if (result.issues.length < 20) result.issues.push({ path, reason }); };
  report();
  for (const source of plan.windows) {
    if (cancelled()) break;
    const count = source.ungroupedTabs.length + source.groups.reduce((n, group) => n + group.tabs.length, 0);
    let windowId = options.windowId;
    let placeholder;
    if (options.mode === "new") {
      try {
        const created = await api.windows.create({ url: "about:blank", type: "normal", focused: false, incognito: false });
        windowId = created.id;
        placeholder = created.tabs?.[0]?.id;
      } catch {
        result.processed += count; result.failed += count;
        issue(source.path, "importWindowFailed"); report();
        continue;
      }
    }
    let openedInWindow = 0;
    let windowCounted = false;
    const openTabs = async (tabs) => {
      const ids = [];
      for (const tab of tabs) {
        if (cancelled()) break;
        try {
          const created = await api.tabs.create({ windowId, url: tab.url, active: false });
          ids.push(created.id); result.opened++; openedInWindow++;
          if (!windowCounted) {
            if (options.mode === "new" || result.windows === 0) result.windows++;
            windowCounted = true;
          }
        } catch { result.failed++; issue(tab.path, "importTabFailed"); }
        result.processed++; report();
      }
      return ids;
    };
    const metadata = [];
    for (const entry of source.groups) {
      if (cancelled()) break;
      const ids = await openTabs(entry.tabs);
      if (!ids.length) continue;
      try {
        const groupId = await api.tabs.group({ tabIds: ids, createProperties: { windowId } });
        result.groups++;
        await api.tabGroups.update(groupId, { title: entry.group.title, color: entry.group.color });
        metadata.push({ id: groupId, collapsed: entry.group.collapsed, path: entry.path });
      } catch { result.groupErrors++; issue(entry.path, "importGroupFailed"); }
      report();
    }
    await openTabs(source.ungroupedTabs);
    // Remove only our placeholder. Never remove, move, navigate or regroup an
    // existing user tab when appending to the current window.
    if (placeholder !== undefined) {
      try {
        if (openedInWindow) await api.tabs.remove(placeholder);
        else await api.windows.remove(windowId);
      } catch { issue(source.path, "importCleanupFailed"); }
    }
    for (const group of metadata) {
      try { await api.tabGroups.update(group.id, { collapsed: group.collapsed }); }
      catch { result.groupErrors++; issue(group.path, "importGroupFailed"); }
    }
    report();
  }
  result.state = cancelled() && result.processed < result.total ? "cancelled" : "complete";
  report();
  return result;
}
