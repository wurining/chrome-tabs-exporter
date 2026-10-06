import { collectSnapshot } from "./lib/data.js";
import { localize, t, language, languageKey } from "./lib/i18n.js";
import { LatestRequest } from "./lib/preview.js";
import { TabSelection, buckets } from "./lib/selection.js";
import { VirtualList } from "./lib/virtual-list.js";
import { icon, mountIcons } from "./lib/icons.js";

const preview = document.getElementById("preview");
const status = document.getElementById("status");
const buttons = [document.getElementById("export-markdown"), document.getElementById("export-json")];
const requests = new LatestRequest();
const selection = new TabSelection();
const include = document.getElementById("include-ungrouped");
const allTabs = document.getElementById("all-tabs");
const allWindows = document.getElementById("all-windows");
const picker = document.getElementById("window-picker");
let exporting = false, loading = true, readFailed = false, tabCount = 0, currentId, statusKey = "", statusError = false;
let windowIndexes = new Map();

function setStatus(key, error = false) {
  statusKey = key;
  statusError = error;
  status.textContent = key ? t(key) : "";
  status.classList.toggle("error", error);
}
function updateButtons() {
  buttons.forEach((button) => { button.disabled = loading || exporting || readFailed || tabCount === 0; });
  document.querySelectorAll("input, .expand-group").forEach((input) => { input.disabled = exporting || loading || readFailed; });
  document.getElementById("refresh").disabled = exporting;
  document.getElementById("settings").disabled = exporting;
}
function windowName(win) {
  const name = t("windowLabel", String(windowIndexes.get(win.id) + 1));
  return win.id === currentId ? `${name} · ${t("currentWindow")}` : name;
}
function groupName(entry) {
  if (!entry.group) return t("ungroupedLabel");
  const index = entry.win.groups.findIndex((item) => item.group.id === entry.group.id) + 1;
  return entry.group.title.trim() || t("untitledGroup", String(index));
}
function checkbox(key, name, state) {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.dataset.focusKey = key;
  input.checked = state.checked;
  input.indeterminate = Boolean(state.mixed);
  input.setAttribute("aria-label", name);
  input.disabled = exporting || loading || readFailed;
  return input;
}
function textSpan(value, className = "row-title") {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = value;
  return span;
}
function windowRow(win) {
  const label = document.createElement("label");
  label.className = "select-row window-row";
  const input = checkbox(`window-${win.id}`, windowName(win), { checked: selection.selectedWindows.has(win.id) });
  input.dataset.windowId = win.id;
  const tabs = buckets(win).flatMap((entry) => entry.tabs);
  const title = tabs[0]?.title || t("untitledTab");
  label.title = `${windowName(win)} — ${title}`;
  label.append(input, textSpan(`${windowName(win)} — ${title}`), textSpan(t("tabCount", String(tabs.length)), "row-count"));
  return label;
}
function tabRow(row) {
  const element = document.createElement(row.type === "tab" ? "label" : "div");
  element.className = `select-row ${row.type}-row`;
  if (row.type === "heading") { element.append(textSpan(windowName(row.win))); return element; }
  if (row.type === "tab") {
    const name = row.tab.title || t("untitledTab");
    const input = checkbox(row.key, name, { checked: selection.isSelected(row.tab) });
    input.dataset.tabId = row.tab.id;
    element.title = `${name}\n${row.tab.url}`;
    element.append(input, textSpan(name));
    return element;
  }
  const entry = row.entry;
  const name = groupName(entry);
  const expand = document.createElement("button");
  expand.className = "expand-group";
  expand.type = "button";
  expand.append(icon("chevron"));
  expand.dataset.groupKey = row.key;
  expand.dataset.focusKey = `expand-${row.key}`;
  expand.setAttribute("aria-label", t(selection.collapsed.has(row.key) ? "expandGroup" : "collapseGroup", name));
  expand.setAttribute("aria-expanded", String(!selection.collapsed.has(row.key)));
  expand.disabled = exporting || loading || readFailed;
  const label = document.createElement("label");
  label.className = "group-selection";
  const state = selection.state(entry.tabs);
  const input = checkbox(row.key, name, state);
  input.dataset.bucketKey = row.key;
  const dot = textSpan("", "dot");
  const color = entry.group?.color || "grey";
  if (["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"].includes(color)) dot.classList.add(`color-${color}`);
  dot.setAttribute("aria-hidden", "true");
  label.title = name;
  label.append(input, dot, textSpan(name), textSpan(t("selectionCount", [String(state.selected), String(state.total)]), "row-count"));
  element.append(expand, label);
  return element;
}
const windowList = new VirtualList(document.getElementById("window-list"), windowRow);
const tabList = new VirtualList(preview, tabRow);

function render() {
  const counts = selection.counts(include.checked);
  tabCount = readFailed ? 0 : counts.tabs;
  for (const [key, id] of [["windows", "window-count"], ["groups", "group-count"], ["tabs", "tab-count"]]) document.getElementById(id).textContent = readFailed ? "—" : counts[key];
  const selectedWindowCount = selection.selectedWindows.size;
  allWindows.checked = selection.windows.length > 0 && selectedWindowCount === selection.windows.length;
  allWindows.indeterminate = selectedWindowCount > 0 && selectedWindowCount < selection.windows.length;
  document.getElementById("window-selection-count").textContent = t("windowSelectionCount", [String(selectedWindowCount), String(selection.windows.length)]);
  const state = selection.state(selection.visibleTabs(include.checked));
  allTabs.checked = state.checked;
  allTabs.indeterminate = state.mixed;
  document.getElementById("window-list").style.height = `${Math.min(128, Math.max(36, selection.windows.length * 36))}px`;
  windowList.setRows(selection.windows);
  const rows = selection.rows(include.checked);
  tabList.setRows(rows);
  const empty = document.getElementById("empty-message");
  empty.hidden = tabCount > 0 || loading || readFailed;
  empty.textContent = t(rows.length ? "noneSelected" : "empty");
  updateButtons();
}
async function refresh() {
  const isLatest = requests.next();
  loading = true;
  preview.setAttribute("aria-busy", "true");
  setStatus("loading");
  updateButtons();
  try {
    const [windows, current] = await Promise.all([collectSnapshot(), chrome.windows.getCurrent()]);
    if (!isLatest()) return;
    currentId = current.id;
    windowIndexes = new Map(windows.map((win, index) => [win.id, index]));
    selection.reconcile(windows, currentId);
    readFailed = false;
    setStatus("");
  } catch {
    if (!isLatest()) return;
    readFailed = true;
    setStatus("readError", true);
  } finally {
    if (isLatest()) {
      loading = false;
      preview.setAttribute("aria-busy", "false");
      render();
    }
  }
}
async function exportData(kind) {
  exporting = true;
  updateButtons();
  setStatus("preparing");
  try {
    const response = await chrome.runtime.sendMessage({ type: "export", kind, language: language(), options: selection.exportOptions(include.checked) });
    if (!response?.ok) throw new Error("Export not started");
    setStatus(response.result.state === "empty" ? "empty" : "downloadStarted");
  } catch { setStatus("downloadNotStarted", true); }
  finally { exporting = false; updateButtons(); }
}
function changed() { setStatus(""); render(); }
document.getElementById("window-list").addEventListener("change", (event) => {
  if (!event.target.matches("input[data-window-id]")) return;
  selection.setWindow(Number(event.target.dataset.windowId), event.target.checked);
  changed();
});
allWindows.addEventListener("change", () => {
  for (const win of selection.windows) selection.setWindow(win.id, allWindows.checked);
  changed();
});
preview.addEventListener("change", (event) => {
  const input = event.target;
  if (input.dataset.tabId) selection.setTabs([{ id: Number(input.dataset.tabId) }], input.checked);
  else if (input.dataset.bucketKey) {
    const bucket = selection.visibleBuckets(include.checked).find((entry) => entry.key === input.dataset.bucketKey);
    if (bucket) selection.setTabs(bucket.tabs, input.checked);
  } else return;
  changed();
});
preview.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-group-key]");
  if (!button) return;
  const key = button.dataset.groupKey;
  if (selection.collapsed.has(key)) selection.collapsed.delete(key); else selection.collapsed.add(key);
  render();
});
allTabs.addEventListener("change", () => { selection.setTabs(selection.visibleTabs(include.checked), allTabs.checked); changed(); });
include.addEventListener("change", changed);
picker.addEventListener("toggle", () => windowList.schedule());
document.addEventListener("click", (event) => { if (!picker.contains(event.target)) picker.open = false; });
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && picker.open) { picker.open = false; picker.querySelector("summary").focus(); } });
document.getElementById("refresh").addEventListener("click", refresh);
document.getElementById("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
buttons[0].addEventListener("click", () => exportData("markdown"));
buttons[1].addEventListener("click", () => exportData("json"));
window.addEventListener("storage", (event) => {
  if (event.key !== languageKey && event.key !== null) return;
  localize(); render(); setStatus(statusKey, statusError);
});
localize();
mountIcons();
refresh();
