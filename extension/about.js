import { localize, t, languageKey } from "./lib/i18n.js";
import { supportConfig } from "./support-config.js";
import { supportChannels } from "./lib/support.js";

function renderLabels() {
  localize();
  for (const image of document.querySelectorAll("[data-i18n-alt]")) image.alt = t(image.dataset.i18nAlt);
}
renderLabels();
window.addEventListener("storage", (event) => { if (event.key === languageKey || event.key === null) renderLabels(); });
const channels = supportChannels(supportConfig);
function showImage(id, path, altKey) {
  if (!path) return;
  const image = document.getElementById(id);
  image.src = path;
  image.dataset.i18nAlt = altKey;
  image.alt = t(altKey);
  image.hidden = false;
  image.addEventListener("error", () => { image.hidden = true; });
}
if (channels.coffeeUrl) {
  document.getElementById("coffee-card").hidden = false;
  document.getElementById("coffee-link").href = channels.coffeeUrl;
  showImage("coffee-qr", channels.coffeeQr, "coffeeQrAlt");
}
for (const [name, path] of [["wechat", channels.wechatQr], ["alipay", channels.alipayQr]]) {
  if (path) {
    document.getElementById(`${name}-card`).hidden = false;
    showImage(`${name}-qr`, path, `${name}QrAlt`);
  }
}
document.getElementById("support-empty").hidden = Boolean(channels.coffeeUrl || channels.wechatQr || channels.alipayQr);
