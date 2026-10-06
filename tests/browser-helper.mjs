import { chromium } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const demoTitles = {
  "/research": "Tab groups — research notes",
  "/specifications": "Specifications [draft] & examples",
  "/notes": "项目笔记 · Project notes",
  "/reference": "Reference documentation",
  "/reading": "Reading list",
  "/checklist": "Release checklist",
  "/guide": "A guide to Markdown"
};
export const htmlEscape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function launchExtension({ locale = "en-US", colorScheme = "light", extensionPath = path.resolve("extension"), viewport = { width: 500, height: 640 }, deviceScaleFactor = 1 } = {}) {
  const temporary = await mkdtemp(path.join(tmpdir(), "chrome-tabs-exporter-"));
  const context = await chromium.launchPersistentContext(path.join(temporary, "profile"), {
    headless: true,
    channel: "chromium",
    locale,
    colorScheme,
    viewport,
    ...(viewport ? { deviceScaleFactor } : {}),
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, `--lang=${locale}`]
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;
  const url = `chrome-extension://${extensionId}/`;
  await context.route(/^https:\/\/example\.(com|org)\//, async (route) => {
    const title = demoTitles[new URL(route.request().url()).pathname] || "Demo tab";
    await route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta charset="utf-8"><title>${htmlEscape(title)}</title></head><body><h1>${htmlEscape(title)}</h1><p>Public example content prepared for extension testing.</p></body></html>` });
  });
  const firstWindow = (await worker.evaluate(() => chrome.windows.getAll({ windowTypes: ["normal"] })))[0];
  const popup = context.pages()[0] ?? await context.newPage();
  const cdp = await context.browser().newBrowserCDPSession();
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: temporary, eventsEnabled: true });
  const secondWindowId = await worker.evaluate(async ({ firstId }) => {
    const create = (windowId, pathname) => chrome.tabs.create({ windowId, url: `https://example.com/${pathname}`, active: false });
    const a = await create(firstId, "research");
    const b = await create(firstId, "specifications");
    const c = await create(firstId, "notes");
    await create(firstId, "reference");
    const group = await chrome.tabs.group({ tabIds: [a.id, b.id], createProperties: { windowId: firstId } });
    await chrome.tabGroups.update(group, { title: "Research [2026]", color: "blue", collapsed: false });
    const unnamed = await chrome.tabs.group({ tabIds: [c.id], createProperties: { windowId: firstId } });
    await chrome.tabGroups.update(unnamed, { color: "purple" });
    const second = await chrome.windows.create({ url: "https://example.org/reading", focused: false });
    const d = await create(second.id, "checklist");
    await create(second.id, "guide");
    const secondGroup = await chrome.tabs.group({ tabIds: [second.tabs[0].id, d.id], createProperties: { windowId: second.id } });
    await chrome.tabGroups.update(secondGroup, { title: "Reading list", color: "green", collapsed: true });
    return second.id;
  }, { firstId: firstWindow.id });
  // API-created tabs can start navigating before Playwright attaches. Reload through
  // Playwright so every screenshot/test uses our public, deterministic demo content.
  await Promise.all(context.pages().filter((page) => page.url().startsWith("https:")).map((page) => page.goto(page.url())));
  await popup.goto(`${url}popup.html`);
  return {
    context, worker, popup, url, firstWindowId: firstWindow.id, secondWindowId, temporary,
    async close() { await context.close(); await rm(temporary, { recursive: true, force: true }); }
  };
}
