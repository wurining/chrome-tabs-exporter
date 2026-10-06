import { expect } from '@playwright/test';

// A Chrome embedded options document is a webview target, rather than a normal
// Playwright frame. Keep native sizing: page viewport emulation also overrides
// guest viewports and would conceal the actual auto-sizing regression.
export async function openEmbeddedOptions(app) {
  const pageCreated = app.context.waitForEvent('page');
  await app.popup.evaluate(() => chrome.runtime.openOptionsPage());
  const manager = await pageCreated;
  await manager.waitForURL('chrome://extensions/**');
  const cdp = await app.context.browser().newBrowserCDPSession();
  let target;
  await expect.poll(async () => {
    const { targetInfos } = await cdp.send('Target.getTargets');
    target = targetInfos.find((entry) => entry.type === 'webview' && entry.url === `${app.url}options.html`);
    return Boolean(target);
  }).toBe(true);
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
  let requestId = 0;
  const evaluate = (fn, arg) => new Promise((resolve, reject) => {
    const id = ++requestId;
    const timeout = setTimeout(() => { cleanup(); reject(Error('Embedded options response timed out')); }, 10000);
    function cleanup() { clearTimeout(timeout); cdp.off('Target.receivedMessageFromTarget', receive); }
    function receive(event) {
      if (event.sessionId !== sessionId) return;
      const message = JSON.parse(event.message);
      if (message.id !== id) return;
      cleanup();
      if (message.error || message.result?.exceptionDetails) reject(Error('Embedded options evaluation failed'));
      else resolve(message.result.result.value);
    }
    cdp.on('Target.receivedMessageFromTarget', receive);
    const expression = `(${fn.toString()})(${JSON.stringify(arg) ?? 'undefined'})`;
    cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }) }).catch((error) => { cleanup(); reject(error); });
  });
  await expect.poll(() => evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({ width: 440, height: 292 });
  // Wait for Chrome's opening animation so the screenshot includes the modal.
  await expect.poll(() => manager.locator('extensions-options-dialog').locator('dialog').evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
  return {
    manager, evaluate,
    async setLanguage(value) {
      await evaluate((language) => {
        const select = document.getElementById('language');
        select.value = language;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }, value);
    },
    async metrics() {
      return evaluate(() => ({
        width: innerWidth, height: innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        contentHeight: document.querySelector('main').getBoundingClientRect().height,
        selectRight: document.getElementById('language').getBoundingClientRect().right,
        footerBottom: document.querySelector('.options-footer').getBoundingClientRect().bottom,
        status: document.getElementById('settings-status').textContent,
        language: document.documentElement.lang
      }));
    }
  };
}
