export function localQr(path) {
  return typeof path === "string" && /^assets\/support\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$/.test(path) ? path : "";
}

export function supportChannels(config) {
  let coffeeUrl = "";
  try {
    const url = new URL(config.buyMeACoffeeUrl);
    if (url.protocol === "https:" && url.hostname === "buymeacoffee.com" && !url.username && !url.password && !url.port && /^\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname) && !url.search && !url.hash) coffeeUrl = url.href;
  } catch { /* Unconfigured channels stay hidden. */ }
  return {
    coffeeUrl,
    coffeeQr: coffeeUrl ? localQr(config.buyMeACoffeeQr) : "",
    wechatQr: localQr(config.wechatQr),
    alipayQr: localQr(config.alipayQr)
  };
}
