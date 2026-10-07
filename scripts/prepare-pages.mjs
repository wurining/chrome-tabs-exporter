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
await writeFile(path.join(root, ".local/github-pages-deploy.txt"), `GitHub Pages 本地发布准备

网站文件：.local/github-pages-site/（仅网页、图标及 Pages 工作流，不含扩展源码）
隐私政策地址：https://wurining.github.io/chrome-tabs-exporter/privacy.html

此命令只生成本地文件，没有上传、开启 Pages 或触发部署。尚未部署时不能将这个地址描述为已上线。

仓库 Settings → Pages → Source 使用 GitHub Actions。每次推送到 main 后，Publish documentation 自动部署 docs/site/；也可以从 main 手动运行。仅本地提交不会触发远程部署。

获准上传后，只更新对应网站文件及工作流；如果仓库已包含完整源码，不要用这个精简文件树替换整个仓库。完整项目修改语言资源或赞助配置后，应运行 npm run docs 并提交生成的网页。

正式提交 Chrome 商店审核前，确认 Pages 部署成功，并在未登录的浏览器打开隐私政策网址。网站只发布 docs/site/，不会发布整个 docs、.local 或 extension。
`);
console.log(`Prepared ${files.length} public website/workflow files in .local/github-pages-site/. No remote operation performed.`);
