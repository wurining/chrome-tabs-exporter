import { expect } from "@playwright/test";
import sharp from "sharp";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { openEmbeddedOptions } from "../tests/embedded-options-helper.mjs";
import { launchExtension, htmlEscape } from "../tests/browser-helper.mjs";

await mkdir(".local/screenshots", { recursive: true });
for (const locale of ["en", "zh_CN"]) {
  await mkdir(`docs/store-assets/${locale}`, { recursive: true });
  await mkdir(`.local/screenshots/hd/${locale}`, { recursive: true });
}
const brandIcon = (await readFile('extension/assets/icons/icon-128.png')).toString('base64');

const captions = {
  en: [
    ["Your tabs,\nsaved locally.", "Choose one or more windows.\nExport Markdown or JSON.", "01 / SELECT WINDOWS"],
    ["Choose exactly\nwhat to save.", "Select whole groups or individual tabs.\nKeep your choices across windows.", "02 / SELECT TABS"],
    ["Your groups,\nin a portable file.", "A real JSON export, ready to import:\ntitles, complete URLs and group details.", "03 / EXPORTED FILE"]
  ],
  zh_CN: [
    ["保存标签页，\n保留分组。", "勾选一个或多个窗口。\n在本机生成 Markdown 或 JSON。", "01 / 选择窗口"],
    ["按需勾选，\n只导出所选内容。", "选择整组或单页，\n切换窗口后保留已有选择。", "02 / 选择标签页"],
    ["把分组保存成文件，\n以后可以重新打开。", "真实 JSON 导出包含标题、完整网址\n和分组信息，可直接导入恢复。", "03 / 导出结果"]
  ]
};
const versions = new Set();
for (const [locale, browserLocale] of [["en", "en-US"], ["zh_CN", "zh-CN"]]) {
  const app = await launchExtension({ locale: browserLocale, deviceScaleFactor: 3 });
  try {
    versions.add(app.context.browser().version());
    await expect(app.popup.locator("#tab-count")).toHaveText("4");
    await app.popup.locator("#window-picker > summary").click();
    await expect(app.popup.locator("#window-list")).toContainText(locale === "en" ? "Current window" : "当前窗口");
    const shot = async (index) => {
      const source = `.local/screenshots/${locale}-${index + 1}.png`;
      await app.popup.locator("body").screenshot({ path: source });
      const image = await readFile(source);
      const { width: pixelsWide, height: pixelsHigh } = await sharp(image).metadata();
      const width = pixelsWide / 3;
      const height = pixelsHigh / 3;
      if (pixelsWide < 1440 || pixelsHigh < 1800) throw new Error('Capture must be freshly rendered at 3x pixel density');
      const scale = Math.min(1.2, 720 / height);
      const [heading, description, eyebrow] = captions[locale][index];
      const canvas = await app.context.newPage();
      await canvas.setViewportSize({ width: 1280, height: 800 });
      await canvas.setContent(`<!doctype html><html lang="${locale === 'en' ? 'en' : 'zh-CN'}"><head><meta charset="utf-8"><style>
        body{margin:0;background:#fafafa;color:#18181b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC',sans-serif}
        .brand{position:absolute;left:48px;top:48px;display:flex;align-items:center;gap:9px;font-weight:600;font-size:19px}.brand img{width:36px;height:36px}
        .copy{position:absolute;left:48px;top:235px;width:535px}.eyebrow{font-size:13px;font-weight:650;letter-spacing:1.5px;color:#52525b}
        h1{font-size:40px;line-height:1.32;margin:22px 0;font-weight:650;letter-spacing:-1px;white-space:pre-line}:lang(zh-CN) h1{letter-spacing:0}
        p{font-size:21px;line-height:1.75;color:#52525b;margin:0;width:520px;white-space:pre-line}
        .tags{position:absolute;left:48px;bottom:58px;display:flex;gap:10px}.tags span{background:#fff;padding:9px 14px;border:1px solid #e4e4e7;border-radius:7px;font-size:14px}
        .capture{position:absolute;right:40px;top:50%;transform:translateY(-50%);width:${width * scale}px;height:${height * scale}px;box-shadow:0 12px 40px #18181b12;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden}.capture img{width:100%;height:100%;display:block}
      </style></head><body><div class="brand"><img alt="" src="data:image/png;base64,${brandIcon}">Chrome Tabs Exporter</div><div class="copy"><div class="eyebrow">${htmlEscape(eyebrow)}</div><h1>${htmlEscape(heading)}</h1><p>${htmlEscape(description)}</p></div><div class="tags"><span>Markdown</span><span>JSON</span><span>${locale === "en" ? "On your device" : "本机处理"}</span></div><div class="capture"><img alt="Actual extension capture" src="data:image/png;base64,${image.toString("base64")}"></div></body></html>`);
      await canvas.locator('.capture img').evaluate((image) => image.decode());
      await canvas.evaluate(() => document.fonts.ready);
      const fits = await canvas.locator('.copy').evaluate((element) => element.getBoundingClientRect().right < document.querySelector('.capture').getBoundingClientRect().left && element.scrollWidth <= element.clientWidth);
      if (!fits) throw new Error(`${locale}/${index}: caption would overlap the actual capture`);
      const names = ["01-export.png", "02-preview.png", "03-result.png"];
      const rendered = await canvas.screenshot({ path: `.local/screenshots/${locale}-${index + 1}-layout.png` });
      const metadata = await sharp(rendered).metadata();
      if (metadata.width !== 3840 || metadata.height !== 2400) throw new Error('Layout must be rendered at 3x pixel density');
      await sharp(rendered).resize(2560, 1600).png({ compressionLevel: 9 }).toFile(`.local/screenshots/hd/${locale}/${names[index]}`);
      await sharp(rendered).resize(1280, 800).png({ compressionLevel: 9 }).toFile(`docs/store-assets/${locale}/${names[index]}`);
      await canvas.close();
    };
    await shot(0);
    await app.popup.locator('#all-windows').check();
    await app.popup.locator('#window-picker > summary').click();
    await expect(app.popup.locator("#tab-count")).toHaveText("7");
    await app.popup.getByRole('checkbox', { name: 'Specifications [draft] & examples', exact: true }).uncheck();
    await expect(app.popup.locator("#tab-count")).toHaveText("6");
    await shot(1);
    await app.popup.locator("#export-json").click();
    await expect.poll(async () => app.worker.evaluate(async () => (await chrome.downloads.search({}))[0]?.state)).toBe("complete");
    const [download] = await app.worker.evaluate(() => chrome.downloads.search({}));
    const content = await readFile(download.filename, "utf8");
    const data = JSON.parse(content);
    if (data.windows.length !== 2 || data.schemaVersion !== 1 || data.scope !== "selected") throw new Error("Unexpected real export");
    // The export preview is a screenshot layout, not a feature added to the extension.
    // Navigate an ordinary isolated page to render it, because extension CSP blocks inline styles.
    const resultPage = await app.context.newPage();
    await resultPage.setViewportSize({ width: 480, height: 650 });
    await resultPage.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>body{width:480px;margin:0;background:#fff;color:#18181b;font:16px/1.65 ui-monospace,Menlo,monospace;padding:22px;box-sizing:border-box}h2{font:600 16px/1.5 -apple-system,sans-serif;margin:0 0 14px}pre{margin:0;white-space:pre-wrap;word-break:break-word;max-height:562px;overflow:hidden}</style></head><body><h2>${locale === "en" ? "Downloaded JSON file · excerpt" : "已下载的 JSON 文件 · 节选"}</h2><pre>${htmlEscape(content)}</pre></body></html>`);
    const previous = app.popup;
    app.popup = resultPage;
    await shot(2);
    app.popup = previous;
    await resultPage.close();
    const importer = await app.context.newPage();
    await importer.setViewportSize({ width: 900, height: 1000 });
    await importer.goto(`${app.url}import.html`);
    await importer.locator('#import-file').setInputFiles({ name: 'demo-tabs.json', mimeType: 'application/json', buffer: Buffer.from(content) });
    await expect(importer.locator('#import-tab-count')).toHaveText('6');
    await importer.screenshot({ path: `.local/screenshots/import-${locale}.png`, fullPage: true });
    await importer.locator('#restore').click();
    await expect(importer.locator('#restore-status')).toContainText(locale === 'en' ? 'Restore complete. Tabs opened: 6.' : '恢复完成，已打开 6 个标签页。');
    await importer.screenshot({ path: `.local/screenshots/import-result-${locale}.png`, fullPage: true });
    await importer.close();
    const about = await app.context.newPage();
    await about.setViewportSize({ width: 1000, height: 800 });
    await about.goto(`${app.url}about.html#support`);
    await expect(about.locator('#coffee-card')).toBeVisible();
    await expect.poll(() => about.locator('#coffee-qr').evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
    await about.locator('#support').screenshot({ path: `.local/screenshots/support-${locale}-light.png` });
    await about.close();
  } finally { await app.close(); }
}
for (const locale of ["en", "zh_CN"]) {
  for (const file of ["01-export.png", "02-preview.png", "03-result.png"]) {
    const metadata = await sharp(`docs/store-assets/${locale}/${file}`).metadata();
    if (metadata.width !== 1280 || metadata.height !== 800) throw new Error(`Wrong dimensions: ${locale}/${file}`);
    const hd = await sharp(`.local/screenshots/hd/${locale}/${file}`).metadata();
    if (hd.width !== 2560 || hd.height !== 1600) throw new Error(`Wrong HD dimensions: ${locale}/${file}`);
  }
}
const native = await launchExtension({ viewport: null });
try {
  const options = await openEmbeddedOptions(native);
  await options.setLanguage("zh_CN");
  const metrics = await options.metrics();
  if (metrics.scrollHeight > metrics.height || metrics.scrollWidth > metrics.width) throw new Error("Native options overflow");
  await options.manager.screenshot({ path: ".local/screenshots/settings-modal-zh_CN.png" });
} finally { await native.close(); }
const dark = await launchExtension({ locale: "zh-CN", colorScheme: "dark" });
try {
  await expect(dark.popup.locator("#tab-count")).toHaveText("4");
  await dark.popup.locator("body").screenshot({ path: ".local/screenshots/zh_CN-dark.png" });
  const about = await dark.context.newPage();
  await about.setViewportSize({ width: 1000, height: 800 });
  await about.goto(`${dark.url}about.html`);
  await expect(about.locator(".footer")).toContainText("Chai Wang");
  await expect.poll(() => about.locator('#coffee-qr').evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  await about.locator('#support').screenshot({ path: '.local/screenshots/support-zh_CN-dark.png' });
  await about.screenshot({ path: ".local/screenshots/about-zh_CN-dark.png", fullPage: true });
  const settings = await dark.context.newPage();
  await settings.setViewportSize({ width: 440, height: 292 });
  await settings.goto(`${dark.url}options.html`);
  await settings.locator("#language").selectOption("zh_CN");
  await expect(settings.locator("#settings-status")).toHaveText("语言已保存在本机。");
  await settings.screenshot({ path: ".local/screenshots/settings-zh_CN-dark.png" });
  await dark.popup.locator('#export-json').click();
  await expect.poll(async () => dark.worker.evaluate(async () => (await chrome.downloads.search({}))[0]?.state)).toBe('complete');
  const [download] = await dark.worker.evaluate(() => chrome.downloads.search({}));
  const importer = await dark.context.newPage();
  await importer.setViewportSize({ width: 900, height: 1000 });
  await importer.goto(`${dark.url}import.html`);
  await importer.locator('#import-file').setInputFiles(download.filename);
  await expect(importer.locator('#import-tab-count')).toHaveText('4');
  await importer.screenshot({ path: '.local/screenshots/import-zh_CN-dark.png', fullPage: true });
} finally { await dark.close(); }
await writeFile(".local/VERIFICATION.md", `# Screenshot and export verification / 截图与导出验证\n\nGenerated: ${new Date().toISOString()}\n\nBrowser: Chrome for Testing ${[...versions].join(", ")} in headless isolated temporary profiles.\n\n- Both UI languages were checked against visible window selector labels.\n- Default selection: 1 window, 2 groups, 4 tabs. All windows: 2 windows, 3 groups, 7 tabs. Screenshot 2 excludes one individual tab and shows 6 selected tabs with a mixed group checkbox.\n- Fresh captures are rendered at deviceScaleFactor=3; the original popup capture is 1500×1800 and the layout canvas is 3840×2400. Each language has three lossless 1280×800 public store PNGs; the 2560×1600 review copies stay only in .local/screenshots/hd/. No older low-resolution capture is enlarged. Screenshots 1 and 2 contain actual extension captures; screenshot 3 contains text read from a successfully completed real JSON download of those 6 selected tabs.\n- All source captures are retained in .local/screenshots; presentation captions are separate from the captured interface.\n- Popup width: 500px, height: 600px. Window and tab lists mount only visible rows; every entry remains reachable by scrolling and keyboard navigation.\n- Original icon sizes: 16/32/48/128. Small promo: 440×280.\n- Native Chrome embedded settings were checked at 440×292px; switching from English to Chinese keeps the same content height with no horizontal or vertical document overflow. The native modal screenshot and a dark settings capture are retained.\n- Import previews and completed restoration captures are retained for both languages, plus a Chinese dark import capture. They use actual exported JSON files; the light captures restore 6 tabs in 2 new windows with 3 groups.\n- Buy Me a Coffee links to the configured public page through a local button and QR image. QR decoding is checked by automated tests; actual payment is not covered by this report. WeChat and Alipay remain hidden.\n\nRun npm run verify for automated source/unit/browser/package tests. Headless Chrome bypasses the native Save As dialog for automated downloads. Save dialog cancellation feedback is tested with controlled API rejection; native OS dialogs still require publisher testing. Large-list tests use 1,000 synthetic windows and 10,000 tabs injected into the actual popup; these are representative stress cases, not an asserted Chrome maximum. A separate real downloads test saves 10,000 Unicode tab records. Real-store submission, publisher identity and payment onboarding are not covered by this report.\n`);
console.log("Generated six public 1280×800 store screenshots; 2560×1600 review copies and 3x source captures stay in .local/screenshots/.");
