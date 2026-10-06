import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
execFileSync(process.execPath, ["scripts/docs.mjs"], { cwd: root, stdio: "inherit" });
const destination = path.join(root, ".local/github-pages-site");
await rm(destination, { recursive: true, force: true });
// This allowlist lets the privacy page be published before extension source.
// No account material, raw captures, drafts or extension files are copied.
const files = [
  ".github/workflows/pages.yml",
  "docs/site/index.html",
  "docs/site/privacy.html",
  "docs/site/.nojekyll",
  "docs/site/assets/icon-128.png"
];
for (const file of files) {
  const target = path.join(destination, file);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(path.join(root, file), target);
}
await writeFile(path.join(root, ".local/github-pages-deploy.txt"), `GitHub Pages 本地发布准备\n\n网站文件：.local/github-pages-site/（仅网页、图标及手动发布工作流，不含扩展源码）\n计划隐私政策地址：https://wurining.github.io/chrome-tabs-exporter/privacy.html\n\n此命令只生成本地文件，没有上传、开启 Pages 或触发部署。地址根据仓库名称预测，尚未部署时不能作为已上线的隐私政策。\n\n可以在本地材料或后台草稿中提前记录计划网址，也可以先上传 ZIP 建立商店草稿。正式提交审核前，隐私政策页面必须已部署且无需登录即可访问；不能等插件正式发布后才部署政策网页。\n\n获准上传后，将这个文件树上传到 wurining/chrome-tabs-exporter 的网站分支；仓库 Settings → Pages → Source 选择 GitHub Actions。在 Actions 中手动运行 Publish documentation，选择网站分支。发布后确认部署成功，并在未登录的浏览器打开上述隐私网址，再提交商店审核。\n\n插件源码后续可以单独发布。未来上传完整仓库时，仍仅将 docs/site 作为 Pages 网站内容，不会把整个 docs、.local 或 extension 作为网站发布。\n`);
console.log(`Prepared ${files.length} public website/workflow files in .local/github-pages-site/. No remote operation performed.`);
