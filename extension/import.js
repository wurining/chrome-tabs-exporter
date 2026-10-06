import { parseImport, importRows } from "./lib/import.js";
import { localize, t, language, languageKey } from "./lib/i18n.js";
import { mountIcons } from "./lib/icons.js";
import { VirtualList } from "./lib/virtual-list.js";

const $ = (id) => document.getElementById(id);
let payload, plan, job, requestId, pollTimer;
let reading = false, starting = false, stopping = false, consumed = false, readRequest = 0;
let fileMessage = "", filePath = "", fileError = false;
let renderedPlan, renderedLanguage;
const running = () => starting || job?.state === "running";
const number = (value) => String(value);

function renderRow(row) {
  const element = document.createElement("div");
  element.className = "select-row import-row";
  if (row.type === "heading") {
    element.classList.add("heading-row");
    element.textContent = t("windowLabel", number(row.number));
  } else if (row.type === "tab") {
    element.classList.add("tab-row");
    const text = document.createElement("span");
    text.className = "row-title";
    text.textContent = row.tab.title || row.tab.url;
    element.title = `${row.tab.title}\n${row.tab.url}`;
    element.append(text);
    if (row.tab.title) {
      const url = document.createElement("span");
      url.className = "import-url";
      url.textContent = row.tab.url;
      element.append(url);
    }
  } else {
    element.classList.add("group-row");
    const dot = document.createElement("span");
    dot.className = `dot color-${row.color || "grey"}`;
    const title = document.createElement("span");
    title.className = "row-title";
    title.textContent = row.type === "ungrouped" ? t("ungroupedLabel") : row.title || t("untitledGroup", number(row.number));
    const count = document.createElement("span");
    count.className = "row-count";
    count.textContent = t("tabCount", number(row.count));
    element.append(dot, title, count);
  }
  return element;
}
const preview = new VirtualList($("import-preview"), renderRow);
preview.element.addEventListener("keydown", (event) => {
  if (event.target !== preview.element || !["Home", "End"].includes(event.key)) return;
  event.preventDefault();
  preview.element.scrollTop = event.key === "Home" ? 0 : preview.element.scrollHeight;
});

function issueList(element, issues) {
  element.replaceChildren(...issues.map((issue) => {
    const li = document.createElement("li");
    li.textContent = `${issue.path}: ${t(issue.reason)}`;
    return li;
  }));
}

function render() {
  localize();
  $("import-file").disabled = running() || reading;
  $("choose-import-file").disabled = running() || reading;
  $("restore-options").disabled = running();
  for (const input of document.querySelectorAll('input[name="restore-mode"]')) input.closest("label").classList.toggle("selected-option", input.checked);
  $("restore").disabled = running() || reading || consumed || !plan?.counts.tabs;
  $("restore-label").textContent = plan ? t("importRestoreCount", number(plan.counts.tabs)) : t("importRestore");
  $("file-status").textContent = fileMessage ? `${t(fileMessage)}${filePath ? ` (${filePath})` : ""}` : "";
  $("file-status").classList.toggle("error", fileError);
  $("import-preview-section").hidden = !plan;
  $("restore-section").hidden = !plan;
  if (plan) {
    for (const key of ["windows", "groups", "tabs"]) $("import-" + key.slice(0, -1) + "-count").textContent = number(plan.counts[key]);
    if (renderedPlan !== plan || renderedLanguage !== language()) {
      preview.setRows(importRows(plan));
      renderedPlan = plan; renderedLanguage = language();
    }
    $("import-warnings").hidden = !plan.counts.skipped;
    $("warning-summary").textContent = t("importSkipped", number(plan.counts.skipped));
    issueList($("warning-list"), plan.issues);
  }
  $("restore-result").hidden = !job;
  if (!job) return;
  $("restore-progress").max = Math.max(1, job.total);
  $("restore-progress").value = job.processed;
  $("cancel-restore").hidden = job.state !== "running";
  $("cancel-restore").disabled = stopping;
  $("cancel-restore").textContent = t(stopping ? "importStopping" : "importStop");
  $("restore-continuation").hidden = job.state !== "running";
  const key = job.state === "running" ? "importRunning" : job.state === "cancelled" ? "importCancelled" : job.state === "interrupted" ? "importInterrupted" : job.failed || job.groupErrors || job.issues.length ? "importPartial" : "importComplete";
  $("restore-status").textContent = t(key, [number(job.opened), number(job.processed), number(job.total)]);
  $("restore-status").classList.toggle("error", job.state === "interrupted");
  $("restore-details").textContent = t("importResultCounts", [number(job.windows), number(job.groups), number(job.failed), number(job.groupErrors), number(job.skipped), number(job.total - job.processed)]);
  $("restore-errors").hidden = !job.issues.length;
  issueList($("restore-error-list"), job.issues);
}

async function poll() {
  clearTimeout(pollTimer);
  try {
    const response = await chrome.runtime.sendMessage({ type: "import-status" });
    if (!response?.ok || (job?.state === "running" && !response.result)) throw Error("No active import");
    job = response.result;
  } catch {
    if (job) job = { ...job, state: "interrupted" };
  }
  render();
  if (job?.state === "running") pollTimer = setTimeout(poll, 500);
}

$("import-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file || running()) return;
  clearTimeout(pollTimer);
  const current = ++readRequest;
  payload = undefined; plan = undefined; job = undefined; consumed = false; stopping = false;
  requestId = crypto.randomUUID();
  reading = true; fileError = false; fileMessage = "importReading"; filePath = "";
  $("file-name").textContent = file.name;
  render();
  try {
    const text = await file.text();
    if (current !== readRequest) return;
    plan = parseImport(text);
    payload = JSON.parse(text.replace(/^\uFEFF/, ""));
    fileMessage = plan.counts.tabs ? "importReady" : "importNoTabs";
    preview.element.scrollTop = 0;
  } catch (error) {
    fileError = true;
    fileMessage = ["importJsonError", "importStructureError", "importVersionError"].includes(error.code) ? error.code : "importFileError";
    filePath = error.path || "";
  } finally {
    if (current === readRequest) { reading = false; render(); }
    // Choosing the same file again is an explicit new restore operation.
    event.target.value = "";
  }
});
$("choose-import-file").addEventListener("click", () => $("import-file").click());
$("restore-options").addEventListener("change", render);

$("restore").addEventListener("click", async () => {
  if (running() || reading || consumed || !plan?.counts.tabs) return;
  starting = true; fileError = false; fileMessage = ""; render();
  try {
    const response = await chrome.runtime.sendMessage({ type: "import-start", requestId, payload, mode: document.querySelector('input[name="restore-mode"]:checked').value });
    if (!response?.ok) {
      const error = new Error(response?.error);
      error.code = response?.error; error.path = response?.path;
      throw error;
    }
    consumed = true; payload = undefined; job = response.result;
    $("restore-result").hidden = false;
    $("restore-result").scrollIntoView({ behavior: "instant", block: "nearest" });
    await poll();
  } catch (error) {
    fileError = true;
    fileMessage = error.code === "importBusy" ? "importBusy" : "importStartFailed";
    filePath = error.path || "";
    if (error.code === "importBusy") await poll();
  } finally { starting = false; render(); }
});

$("cancel-restore").addEventListener("click", async () => {
  stopping = true; render();
  try { await chrome.runtime.sendMessage({ type: "import-cancel", requestId: job?.requestId }); }
  catch { fileError = true; fileMessage = "importStopFailed"; stopping = false; }
  await poll();
});
window.addEventListener("storage", (event) => { if (event.key === languageKey) render(); });
mountIcons();
render();
await poll();
