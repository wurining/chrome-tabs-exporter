import { readFile, readdir, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import path from "node:path";
import sharp from "sharp";
import jsQR from "jsqr";
import { supportConfig } from "../extension/support-config.js";
import { supportChannels, localQr } from "../extension/lib/support.js";
import { localeMessages } from "../extension/lib/messages.js";

const manifest = JSON.parse(await readFile("extension/manifest.json", "utf8"));
const pkg = JSON.parse(await readFile("package.json", "utf8"));
assert.equal(manifest.version, pkg.version);
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.incognito, "not_allowed");
assert.equal(manifest.minimum_chrome_version, "99");
assert.deepEqual(manifest.permissions, ["tabs", "tabGroups", "downloads"]);
assert.equal(manifest.host_permissions, undefined);
assert.deepEqual(manifest.options_ui, { page: "options.html", open_in_tab: false });
const messages = {};
for (const locale of ["en", "zh_CN"]) messages[locale] = JSON.parse(await readFile(`extension/_locales/${locale}/messages.json`, "utf8"));
assert.deepEqual(Object.keys(messages.en).sort(), Object.keys(messages.zh_CN).sort());
assert.deepEqual(localeMessages, messages, "Run npm run locales after changing translations");
for (const [locale, entries] of Object.entries(messages)) {
  for (const [key, entry] of Object.entries(entries)) {
    assert.ok(entry.message, `${locale}:${key} is empty`);
    for (const [, name] of entry.message.matchAll(/\$([A-Z0-9_]+)\$/g)) assert.ok(entry.placeholders?.[name.toLowerCase()], `${key}: missing placeholder ${name}`);
  }
}
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(name); else files.push(name);
  }
}
await walk("extension");
for (const name of files) {
  if (name.endsWith(".js")) {
    execFileSync(process.execPath, ["--check", name], { stdio: "pipe" });
    const source = await readFile(name, "utf8");
    assert.ok(!/\beval\s*\(|new\s+Function\s*\(|\bfetch\s*\(|XMLHttpRequest|WebSocket|\.innerHTML\s*=|import\s*\(\s*['"]https?:/.test(source), `${name}: unsafe or network-executing code`);
    for (const [, key] of source.matchAll(/\bt\("([a-zA-Z0-9]+)"/g)) assert.ok(messages.en[key], `${name}: unknown message ${key}`);
  }
  if (name.endsWith(".html")) {
    const source = await readFile(name, "utf8");
    assert.ok(!/<script[^>]*src=["']https?:|\son\w+=|<script[^>]*>\s*[^<\s]/.test(source), `${name}: remote or inline script`);
    for (const [, key] of source.matchAll(/data-i18n(?:-label)?="([a-zA-Z0-9]+)"/g)) assert.ok(messages.en[key], `${name}: unknown message ${key}`);
  }
}
for (const icon of Object.values(manifest.icons)) assert.ok((await stat(`extension/${icon}`)).size > 0);
const channels = supportChannels(supportConfig);
assert.ok(!supportConfig.buyMeACoffeeUrl || channels.coffeeUrl, "Invalid Buy Me a Coffee page URL");
assert.ok(!supportConfig.buyMeACoffeeQr || channels.coffeeUrl, "A coffee QR needs a valid page URL");
for (const key of ["buyMeACoffeeQr", "wechatQr", "alipayQr"]) {
  if (supportConfig[key]) {
    assert.ok(localQr(supportConfig[key]), `Invalid local image path: ${key}`);
    assert.ok((await stat(`extension/${supportConfig[key]}`)).size, `Missing QR: ${key}`);
  }
}
const configuredQrs = new Set([channels.coffeeQr, channels.wechatQr, channels.alipayQr].filter(Boolean).map((item) => `extension/${item}`));
if (channels.coffeeQr) {
  const { data, info } = await sharp(`extension/${channels.coffeeQr}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  assert.equal(decoded?.data, channels.coffeeUrl, "Coffee QR must decode to the configured public page");
}
for (const name of files.filter((file) => file.startsWith("extension/assets/support/"))) assert.ok(configuredQrs.has(name), `Unconfigured sponsor asset would be bundled: ${name}`);
console.log(`Checked ${files.length} extension files, both locales, permissions, CSP-compatible sources and sponsor configuration.`);
