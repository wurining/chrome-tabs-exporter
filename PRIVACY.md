# Chrome Tabs Exporter — Privacy policy / 隐私政策

## English

Effective date: October 6, 2026. Publisher: Chai Wang. Extension version: 1.0.0.

When you open the popup or refresh its list, the extension reads tab titles, full URLs, window boundaries and native group names, colors and collapsed states in normal windows for selection. Export re-reads selected windows and includes only selected tabs still present. Temporary browser IDs and positions organize selections and are omitted from files. Incognito windows and this extension’s own pages are excluded. When you choose an import file, the extension reads its JSON contents locally to validate and preview URLs and groups. Only after you request restoration does it create tabs, windows and groups from that file.

File and tab data are processed only on your device. The extension does not upload files or tab lists to the developer or an analytics service. It has no analytics, ads, tracking or remotely executed code. Restoring tabs navigates to the imported URLs: Chrome then contacts those websites normally, under their own privacy policies, using your existing browser session.

Only the interface language preference is saved in local extension storage. No browsing archive or imported file is stored by the extension. Popup selections and import previews stay temporarily in page memory. A restoration job holds its URLs in background memory until it finishes or stops, allowing it to continue after the import page closes; its latest counts and up to 20 issue paths remain in background memory until replaced or the worker/browser stops. A browser restart or extension reload interrupts the job. Existing popup choices survive window changes, ungrouped visibility and refresh while open; newly discovered tabs start selected and new windows unchecked. Exported files remain where you save them until deleted; Chrome may keep normal download records.

The developer does not sell, share or use tab/file data for advertising, profiling, creditworthiness or purposes outside local tab export and restoration. Opening GitHub or a support link sends no tab data or file contents to that website. Restored websites receive normal browser navigation requests for their own URLs.

If you choose to visit Buy Me a Coffee, WeChat, Alipay, or GitHub, that service processes your interactions under its own privacy policy. The extension does not collect payment details, receive payment notifications, verify sponsorship, or link payments to your tabs. A payment provider may provide the developer with the sponsor details it normally shares.

Exported files contain complete URLs, which may include private links or access parameters. Check the file before sharing it. Browser-internal and non-web URLs are exported as text in Markdown; JSON retains the original URL.

Use of data received from Chrome APIs complies with the Chrome Web Store User Data Policy, including Limited Use requirements. Data is used only for the visible, user-requested local tab export and restoration features.

For privacy questions, contact Chai Wang through this repository’s GitHub Issues. Do not include private tab URLs, tokens, or payment information in a public issue.

## 简体中文

生效日期：2026 年 10 月 6 日。发布者：Chai Wang。扩展版本：1.0.0。

打开弹窗或刷新列表时，扩展读取普通窗口中的标签页标题、完整网址、窗口结构及原生分组的组名、颜色和折叠状态，供你选择。导出时重新读取所选窗口，仅导出仍存在的已选页面。浏览器临时编号和位置用于整理选择，不写入文件。隐身窗口和本扩展自身页面被排除。选择导入文件时，扩展在本机读取其中的 JSON 内容，验证并预览网址和分组；只有点击恢复后，才根据该文件创建标签页、窗口与分组。

文件与标签页数据仅在本机处理，扩展不将文件或标签页清单上传给开发者或分析服务，不包含统计、广告、追踪或远程执行代码。恢复标签页会访问导入的网址：Chrome 随后使用现有浏览器会话正常访问对应网站，网站按自身隐私政策处理访问。

扩展仅在本机保存界面语言偏好，不存储浏览记录存档或导入文件。弹窗选择和导入预览暂存于页面内存。恢复任务在完成或停止前，将待打开的网址暂存于后台内存，因此关闭导入页面后仍可继续；最近一次任务的数量及最多 20 条问题路径会在后台内存中保留，直至被新任务替换或后台／浏览器停止。浏览器重启或扩展重新加载会中断任务。同一弹窗中的窗口切换、未分组显示及刷新保留原有选择，新发现的页面默认选中，新窗口默认不勾选。导出文件保留在你选择的位置，直至自行删除；Chrome 可能保留普通下载记录。

开发者不出售、共享或使用标签页／文件数据进行广告、画像、信用评估或本地导出与恢复之外的用途。打开 GitHub 或赞助链接不会向该网站发送标签页数据或文件内容。恢复的网站会收到浏览器对其自身网址的正常访问请求。

如果你选择访问 Buy Me a Coffee、微信、支付宝或 GitHub，相应服务按其自身隐私政策处理你的操作。扩展不收集付款信息、不接收付款通知、不验证赞助，也不将付款与你的标签页关联。支付平台可能向开发者提供其通常共享的赞助者信息。

导出文件包含完整网址，其中可能有私人链接或访问参数。分享前请自行检查。浏览器内部网址及其他非网页网址在 Markdown 中以文本显示，JSON 保留原始网址。

从 Chrome 接口获得的数据遵守 Chrome 商店用户数据政策及有限用途(Limited Use)要求，仅用于用户明确请求且可见的本地标签页导出与恢复功能。

如有隐私问题，请通过本仓库的 GitHub Issues 联系 Chai Wang。公开反馈中请勿附带私人标签页网址、访问令牌或付款信息。

Contact / 联系：[GitHub Issues](https://github.com/wurining/chrome-tabs-exporter/issues)
