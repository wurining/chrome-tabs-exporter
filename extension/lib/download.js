import { filename, formatJson, formatMarkdown } from "./format.js";
import { summarize } from "./data.js";

export async function downloadExport(windows, options, kind, t, api = chrome, date = new Date()) {
  if (!["markdown", "json"].includes(kind)) throw new TypeError("Invalid export format");
  if (!summarize(windows).tabs) return { state: "empty" };
  const content = kind === "markdown" ? formatMarkdown(windows, options, t, date) : formatJson(windows, options, date);
  const mime = kind === "markdown" ? "text/markdown" : "application/json";
  // A self-contained data URL survives the popup closing; no document-owned Blob URL is needed.
  const id = await api.downloads.download({
    url: `data:${mime};charset=utf-8,${encodeURIComponent(content)}`,
    filename: filename(kind, options.scope, date),
    saveAs: true
  });
  if (!Number.isInteger(id)) throw new Error("Download was not started");
  return { state: "started", downloadId: id };
}
