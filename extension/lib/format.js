import { plainWindows } from "./data.js";

export function escapeMarkdown(value) {
  return String(value ?? "").replace(/[\r\n\t]/g, " ")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/[\\`*_{}\[\]()#+.!|~\-]/g, "\\$&");
}

function codeSpan(value) {
  const text = String(value).replace(/[\r\n]/g, " ");
  const runs = text.match(/`+/g) ?? [];
  const marker = "`".repeat(Math.max(0, ...runs.map((run) => run.length)) + 1);
  return `${marker} ${text} ${marker}`;
}

export function markdownTab(tab, fallback) {
  const title = escapeMarkdown(tab.title || fallback);
  let isWeb = false;
  try { isWeb = ["http:", "https:"].includes(new URL(tab.url).protocol); } catch { /* Keep unavailable URLs as text. */ }
  if (!isWeb) return tab.url ? `${title} — ${codeSpan(tab.url)}` : title;
  const destination = tab.url.replace(/[\s<>\\\u0000-\u001f\u007f]/gu, (character) => encodeURIComponent(character));
  return `[${title}](<${destination}>)`;
}

export function exportPayload(windows, options, date = new Date()) {
  return {
    schemaVersion: 1,
    exportedAt: date.toISOString(),
    scope: options.scope,
    includeUngrouped: options.includeUngrouped,
    windows: plainWindows(windows)
  };
}

export function formatJson(windows, options, date = new Date()) {
  return JSON.stringify(exportPayload(windows, options, date), null, 2) + "\n";
}

export function formatMarkdown(windows, options, t, date = new Date()) {
  const lines = [
    `# ${t("exportHeading")}`, "",
    `- ${t("exportTime")}: ${date.toISOString()}`,
    `- ${t("scopeLabel")}: ${t(options.scope === "selected" ? "selectedWindows" : options.scope === "all" ? "allWindows" : "currentWindow")}`,
    `- ${t("includeUngrouped")}: ${t(options.includeUngrouped ? "yes" : "no")}`, ""
  ];
  const addTabs = (tabs) => {
    tabs.forEach((tab, index) => lines.push(`${index + 1}. ${markdownTab(tab, t("untitledTab"))}`));
    lines.push("");
  };
  windows.forEach((win, index) => {
    lines.push(`## ${t("windowLabel", String(index + 1))}`, "");
    win.groups.forEach((entry, groupIndex) => {
      const title = entry.group.title.trim() || t("untitledGroup", String(groupIndex + 1));
      lines.push(`### ${escapeMarkdown(title)}`, "", `- ${t("colorLabel")}: ${entry.group.color}`, `- ${t("collapsedLabel")}: ${t(entry.group.collapsed ? "yes" : "no")}`, "");
      addTabs(entry.tabs);
    });
    if (win.ungroupedTabs.length) {
      lines.push(`### ${t("ungroupedLabel")}`, "");
      addTabs(win.ungroupedTabs);
    }
  });
  return lines.join("\n");
}

export function filename(kind, scope, date = new Date()) {
  const stamp = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `chrome-tabs-${scope}-${stamp}.${kind === "markdown" ? "md" : "json"}`;
}
