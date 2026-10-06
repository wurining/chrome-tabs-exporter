export function buckets(win) {
  return [
    ...win.groups.map((entry) => ({ key: `group-${entry.group.id}`, group: entry.group, tabs: entry.tabs })),
    { key: `ungrouped-${win.id}`, group: null, tabs: win.ungroupedTabs }
  ];
}

export class TabSelection {
  windows = [];
  selectedWindows = new Set();
  excludedTabs = new Set();
  collapsed = new Set();
  initialized = false;

  reconcile(windows, currentId) {
    this.windows = windows;
    const windowIds = new Set(windows.map((win) => win.id));
    const tabIds = new Set(windows.flatMap((win) => buckets(win).flatMap((entry) => entry.tabs.map((tab) => tab.id))));
    const bucketIds = new Set(windows.flatMap((win) => buckets(win).map((entry) => entry.key)));
    if (!this.initialized) {
      const initial = windowIds.has(currentId) ? currentId : windows[0]?.id;
      if (initial !== undefined) this.selectedWindows.add(initial);
      this.initialized = true;
    }
    for (const id of this.selectedWindows) if (!windowIds.has(id)) this.selectedWindows.delete(id);
    for (const id of this.excludedTabs) if (!tabIds.has(id)) this.excludedTabs.delete(id);
    for (const key of this.collapsed) if (!bucketIds.has(key)) this.collapsed.delete(key);
  }

  isSelected(tab) { return !this.excludedTabs.has(tab.id); }
  setTabs(tabs, checked) {
    for (const tab of tabs) if (checked) this.excludedTabs.delete(tab.id); else this.excludedTabs.add(tab.id);
  }
  setWindow(id, checked) {
    if (checked) this.selectedWindows.add(id); else this.selectedWindows.delete(id);
  }
  state(tabs) {
    const selected = tabs.reduce((sum, tab) => sum + Number(this.isSelected(tab)), 0);
    return { checked: tabs.length > 0 && selected === tabs.length, mixed: selected > 0 && selected < tabs.length, selected, total: tabs.length };
  }
  visibleBuckets(includeUngrouped) {
    return this.windows.filter((win) => this.selectedWindows.has(win.id)).flatMap((win) =>
      buckets(win).filter((entry) => entry.tabs.length && (entry.group || includeUngrouped)).map((entry) => ({ ...entry, win })));
  }
  visibleTabs(includeUngrouped) { return this.visibleBuckets(includeUngrouped).flatMap((entry) => entry.tabs); }
  exportOptions(includeUngrouped) {
    return {
      scope: "selected", includeUngrouped,
      windowIds: this.windows.filter((win) => this.selectedWindows.has(win.id)).map((win) => win.id),
      tabIds: this.visibleTabs(includeUngrouped).filter((tab) => this.isSelected(tab)).map((tab) => tab.id)
    };
  }
  counts(includeUngrouped) {
    const windows = new Set();
    let groups = 0, tabs = 0;
    for (const entry of this.visibleBuckets(includeUngrouped)) {
      const count = this.state(entry.tabs).selected;
      if (!count) continue;
      windows.add(entry.win.id);
      if (entry.group) groups++;
      tabs += count;
    }
    return { windows: windows.size, groups, tabs };
  }
  rows(includeUngrouped) {
    const rows = [];
    const multiple = this.selectedWindows.size > 1;
    let previousWindow;
    for (const entry of this.visibleBuckets(includeUngrouped)) {
      if (multiple && previousWindow !== entry.win.id) rows.push({ type: "heading", key: `heading-${entry.win.id}`, win: entry.win });
      previousWindow = entry.win.id;
      rows.push({ type: "group", key: entry.key, entry });
      if (!this.collapsed.has(entry.key)) for (const tab of entry.tabs) rows.push({ type: "tab", key: `tab-${tab.id}`, tab });
    }
    return rows;
  }
}
