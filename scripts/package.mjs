import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

execFileSync(process.execPath, ["scripts/check.mjs"], { stdio: "inherit" });
const { version } = JSON.parse(await readFile("extension/manifest.json", "utf8"));
const files = [];
async function walk(dir) {
  for (const entry of await readdir(`extension/${dir}`, { withFileTypes: true })) {
    const name = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await walk(name); else files.push(name);
  }
}
await walk("");
files.sort();
await mkdir("dist", { recursive: true });
const output = `dist/chrome-tabs-exporter-${version}.zip`;
// Fixed timestamps, stable order, no platform metadata, and explicit runtime-only inputs.
const script = `import sys,zipfile\nfrom pathlib import Path\nfiles=sys.stdin.read().splitlines()\nwith zipfile.ZipFile(sys.argv[1],'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:\n for name in files:\n  info=zipfile.ZipInfo(name,(2026,1,1,0,0,0)); info.compress_type=zipfile.ZIP_DEFLATED; info.create_system=3; info.external_attr=0o100644<<16\n  z.writestr(info,Path('extension',name).read_bytes(),compresslevel=9)\n`;
execFileSync("python3", ["-c", script, output], { input: files.join("\n") + "\n" });
const digest = createHash("sha256").update(await readFile(output)).digest("hex");
await writeFile(`${output}.sha256`, `${digest}  chrome-tabs-exporter-${version}.zip\n`);
console.log(`${output}\nSHA-256: ${digest}`);
