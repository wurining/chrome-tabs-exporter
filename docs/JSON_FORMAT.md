# JSON import / JSON 导入格式

Existing `schemaVersion: 1` exports can be imported directly. Metadata such as `exportedAt`, `scope` and `includeUngrouped` is not needed for restoration. Importing previews the file; opening tabs requires the user's Restore action.

现有 `schemaVersion: 1` 导出文件可直接导入。恢复不需要 `exportedAt`、`scope`、`includeUngrouped` 等导出记录字段。选择文件只预览，点击“恢复”才打开页面。

Ready-to-import example / 可直接试用的[示例文件](../examples/minimal-tabs.json)：1 window, 1 group, 3 tabs / 1 个窗口、1 个分组、3 个标签页。

## Minimal examples / 最简示例

One ungrouped tab / 一个未分组标签页：

```json
{
  "windows": [
    { "ungroupedTabs": [{ "url": "https://example.com" }] }
  ]
}
```

A group and an ungrouped tab / 一个分组和一个未分组标签页：

```json
{
  "schemaVersion": 1,
  "windows": [
    {
      "groups": [
        {
          "group": { "title": "Research", "color": "blue", "collapsed": true },
          "tabs": [
            { "url": "https://example.com/notes", "title": "Notes" },
            { "url": "https://example.org" }
          ]
        }
      ],
      "ungroupedTabs": [{ "url": "https://example.com/reference" }]
    }
  ]
}
```

The entire `group` object can be omitted while keeping `tabs`, which still creates a group.

整个 `group` 属性可以省略；保留 `tabs` 数组就会创建分组。

## Fields / 字段

| Field | Required / 必选 | Default / 默认值 |
| --- | --- | --- |
| `windows` | Array / 数组 | Required / 必选 |
| `windows[].groups` | At least `groups` or `ungroupedTabs` / 每个窗口至少提供两者之一 | `[]` |
| `windows[].ungroupedTabs` | At least `groups` or `ungroupedTabs` / 同上 | `[]` |
| `groups[].tabs` | Array / 数组 | Required for a group entry / 分组条目必选 |
| Every tab's `url` | String / 字符串 | Required; invalid or unsupported URLs are skipped / 必选，无效或不支持的网址会跳过 |
| Every tab's `title` | Optional string / 可选字符串 | `""`; preview uses URL / 预览使用网址 |
| `groups[].group` | Optional object / 可选对象 | `{}` |
| `group.title` | Optional string / 可选字符串 | `""` (unnamed group / 未命名分组) |
| `group.color` | Optional enum / 可选枚举(Enumeration) | `"grey"` |
| `group.collapsed` | Optional boolean / 可选布尔值(Boolean) | `false` |
| `schemaVersion` | Optional, must be `1` when present / 可省略，提供时必须为 `1` | `1` |

Supported colors: `grey`, `blue`, `red`, `yellow`, `green`, `pink`, `purple`, `cyan`, `orange`.

字段类型错误或未知颜色会拒绝整个文件，并显示从 0 开始的字段路径，例如 `windows[0].groups[1].tabs[2].url`。空数组可以出现；没有可用标签页的分组或窗口不会创建。未识别的额外属性（包括旧浏览器编号）被忽略。重复网址照常打开，完整访问参数保留。

Incorrect types or unknown colors reject the whole file before anything opens, with a zero-based field path. Empty arrays are allowed; groups/windows with no supported tabs are not created. Unknown extra properties, including old browser IDs, are ignored. Duplicate URLs are retained, with full query parameters. There is no fixed window/tab count cap; resource limits still depend on Chrome and the device.

## Supported URLs / 支持的网址

- `http:` / `https:`
- `file:` — opening remains subject to Chrome's local file restrictions / 打开仍受 Chrome 本地文件限制。
- `about:blank`
- `chrome://newtab`, `settings`, `extensions`, `downloads`, `history`, `bookmarks`, `version`, `flags` (including paths / 包括子路径)。

Other URLs are skipped and reported before restoration. This includes executable `javascript:` / `data:` URLs, other extensions' URLs, external-app protocols and special Chrome commands such as `chrome://quit` / `restart` / `crash`. Up to 20 issue paths are displayed; the full skipped count remains visible. JSON files are treated as data and never inserted as HTML or executed as code.

其他网址在恢复前跳过并显示原因，包括可执行的 `javascript:`／`data:`、其他扩展页面、外部应用协议及退出／重启／崩溃等 Chrome 命令。最多显示前 20 条问题路径，跳过总数完整显示。文件按数据处理，不作为 HTML 或脚本执行。

## Restoration behavior / 恢复行为

New windows follow file order. Groups and their tabs are created in array order, followed by that window's ungrouped tabs. Appending processes each source window in sequence and creates separate groups even when names match. Existing user tabs are never closed, moved or navigated. Import metadata such as arbitrary window IDs, geometry, incognito flags or old tab IDs is not applied.

创建新窗口时，按文件顺序创建窗口、分组和组内标签页，再打开该窗口的未分组标签页。追加模式依次处理文件中的各窗口，同名分组各自创建。现有标签页不会被关闭、移动或跳转；文件中额外的窗口编号、大小、隐身标志或旧标签编号不应用。

The export format contains no back/forward history, unsaved page state, login sessions, pinned/active flags, window geometry or exact grouped/ungrouped interleaving. Restoration opens URLs using the browser's current session; Chrome manages the active tab; that choice is not recorded in the file. Titles are obtained from reopened pages. A successful tab creation does not verify site loading. Stops and partial failures keep already opened tabs and report counts. Restarting the browser or reloading the extension interrupts the job; inspect existing tabs before rerunning to avoid duplicates.

此格式未保存前进后退记录、未保存的页面内容、登录会话、固定／激活状态、窗口大小或分组与未分组页面之间的精确位置。恢复使用浏览器当前会话打开网址；激活页面由 Chrome 管理，文件没有记录该选择。标题由重新打开的网站提供，创建标签页成功不代表网站已加载成功。停止或部分失败时保留已打开页面并显示数量。浏览器重启或扩展重新加载会中断任务，再次运行前应检查现有页面，避免重复。

Official API references: [tabs creation and grouping](https://developer.chrome.com/docs/extensions/reference/api/tabs), [window creation](https://developer.chrome.com/docs/extensions/reference/api/windows), [group properties](https://developer.chrome.com/docs/extensions/reference/api/tabGroups).
