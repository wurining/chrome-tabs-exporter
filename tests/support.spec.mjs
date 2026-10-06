import { test, expect } from "@playwright/test";
import sharp from "sharp";
import jsQR from "jsqr";
import { launchExtension } from "./browser-helper.mjs";

for (const [locale, expectedText] of [["en-US", "Buy me a token"], ["zh-CN", "支持我的 Token 开销"]]) {
  for (const colorScheme of ["light", "dark"]) {
    test(`local support button and displayed QR work in ${locale} ${colorScheme} without remote resources`, async () => {
      const app = await launchExtension({ locale, colorScheme });
      try {
        const about = await app.context.newPage();
        await about.setViewportSize({ width: 1000, height: 800 });
        const requests = [];
        about.on("request", (request) => requests.push(request.url()));
        await about.goto(`${app.url}about.html#support`);
        await expect(about.locator('#coffee-card')).toBeVisible();
        await expect(about.locator('#coffee-link')).toHaveText(`💵${expectedText}`);
        await expect(about.locator('#coffee-link')).toHaveAttribute('href', 'https://buymeacoffee.com/chaiwang');
        await expect(about.locator('#coffee-link')).toHaveAttribute('target', '_blank');
        await expect(about.locator('#coffee-link')).toHaveCSS('background-color', 'rgb(255, 221, 0)');
        await expect(about.locator('#coffee-qr')).toBeVisible();
        await expect(about.locator('#support-empty')).toBeHidden();
        await expect(about.locator('#wechat-card')).toBeHidden();
        await expect(about.locator('#alipay-card')).toBeHidden();
        await expect.poll(() => about.locator('#coffee-qr').evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
        // Decode the displayed pixels (including the CSS scaling and dark theme),
        // not just the source image or its filename.
        const screenshot = await about.locator('#coffee-qr').screenshot();
        const { data, info } = await sharp(screenshot).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        expect(jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data).toBe('https://buymeacoffee.com/chaiwang');
        expect(requests.every((url) => url.startsWith(app.url))).toBe(true);
        if (locale === 'en-US' && colorScheme === 'light') {
          const settings = await app.context.newPage();
          await settings.goto(`${app.url}options.html`);
          await settings.locator('#language').selectOption('zh_CN');
          await expect(about.locator('#coffee-link')).toContainText('支持我的 Token 开销');
          await expect(about.locator('#coffee-qr')).toHaveAttribute('alt', '开发者 Buy Me a Coffee 页面的二维码');
          await settings.locator('#language').selectOption('en');
        }
        // Prove the destination without contacting the live payment service.
        await app.context.route('https://buymeacoffee.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Support destination fixture</title>' }));
        const opened = app.context.waitForEvent('page');
        await about.locator('#coffee-link').click();
        const external = await opened;
        await external.waitForURL('https://buymeacoffee.com/chaiwang');
        expect(external.url()).toBe('https://buymeacoffee.com/chaiwang');
      } finally { await app.close(); }
    });
  }
}
