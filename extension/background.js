import { collectData } from "./lib/data.js";
import { downloadExport } from "./lib/download.js";
import { tForLocale } from "./lib/i18n.js";
import { parseImport } from "./lib/import.js";
import { restoreImport } from "./lib/restore.js";

let importJob;
function startImport(message, sender) {
  if (importJob?.requestId === message.requestId) return importJob.status;
  if (importJob?.status.state === "running") throw Error("importBusy");
  if (typeof message.requestId !== "string" || message.requestId.length > 100 || !["new", "current"].includes(message.mode)) throw Error("importStartFailed");
  const plan = parseImport(message.payload);
  if (!plan.counts.tabs) throw Error("importNoTabs");
  const job = { requestId: message.requestId, cancelled: false, status: { requestId: message.requestId, state: "running", total: plan.counts.tabs, processed: 0, opened: 0, windows: 0, groups: 0, failed: 0, groupErrors: 0, skipped: plan.counts.skipped, issues: [] } };
  importJob = job;
  void restoreImport(plan, { mode: message.mode, windowId: sender.tab?.windowId }, chrome, {
    cancelled: () => job.cancelled,
    progress: (status) => { job.status = { ...status, requestId: job.requestId }; }
  }).catch(() => { job.status = { ...job.status, state: "interrupted" }; });
  return job.status;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(""))) return false;
  if (["import-start", "import-status", "import-cancel"].includes(message?.type)) {
    if (sender.url !== chrome.runtime.getURL("import.html")) return false;
    try {
      if (message.type === "import-start") sendResponse({ ok: true, result: startImport(message, sender) });
      else {
        if (message.type === "import-cancel" && importJob?.status.state === "running" && message.requestId === importJob.requestId) importJob.cancelled = true;
        sendResponse({ ok: true, result: importJob?.status ?? null });
      }
    } catch (error) { sendResponse({ ok: false, error: error.code || error.message, path: error.path }); }
    return false;
  }
  if (message?.type !== "export") return false;
  (async () => {
    const windows = await collectData(message.options);
    const language = message.language === "zh_CN" ? "zh_CN" : "en";
    return downloadExport(windows, message.options, message.kind, (key, values) => tForLocale(language, key, values));
  })().then((result) => sendResponse({ ok: true, result }), () => sendResponse({ ok: false }));
  return true;
});
