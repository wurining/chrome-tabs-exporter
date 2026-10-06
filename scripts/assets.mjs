import sharp from "sharp";
import QRCode from "qrcode";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { supportConfig } from "../extension/support-config.js";
import { supportChannels } from "../extension/lib/support.js";

const root = fileURLToPath(new URL("../", import.meta.url));
export const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect x="16" y="16" width="96" height="96" rx="24" fill="#2459d3"/><path d="M38 44h44a6 6 0 0 1 6 6v7H38z" fill="#9bb8ff"/><rect x="30" y="54" width="58" height="37" rx="6" fill="white"/><path d="M40 66h24M40 75h18" stroke="#2459d3" stroke-width="4" stroke-linecap="round"/><circle cx="87" cy="88" r="19" fill="#102d76"/><path d="M87 77v21m-8-8 8 8 8-8" fill="none" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
await mkdir(path.join(root, "docs/store-assets/source"), { recursive: true });
await writeFile(path.join(root, "docs/store-assets/source/icon.svg"), iconSvg + "\n");
for (const size of [16, 32, 48, 128]) {
  await sharp(Buffer.from(iconSvg)).resize(size, size).png().toFile(path.join(root, `extension/assets/icons/icon-${size}.png`));
}
await sharp(Buffer.from(iconSvg)).png().toFile(path.join(root, "docs/store-assets/icon-128.png"));
// The approved imagegen artwork is the source; routine asset generation only
// derives the store-size image and never replaces it with a placeholder.
await sharp(path.join(root, "docs/store-assets/promo-master.png"))
  .resize(440, 280, { fit: "cover" }).removeAlpha().png({ compressionLevel: 9 })
  .toFile(path.join(root, "docs/store-assets/promo-440x280.png"));
const channels = supportChannels(supportConfig);
if (channels.coffeeUrl && channels.coffeeQr) {
  const target = path.join(root, "extension", channels.coffeeQr);
  await mkdir(path.dirname(target), { recursive: true });
  await QRCode.toFile(target, channels.coffeeUrl, { type: "png", errorCorrectionLevel: "M", margin: 4, scale: 12, color: { dark: "#000000ff", light: "#ffffffff" } });
}
console.log("Generated icons, the store-sized promotional image and the configured local coffee QR.");
