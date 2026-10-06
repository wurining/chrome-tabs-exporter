# Changelog

## 1.0.0 — 2026-10-06

- Replaced the small promotional image with approved generated artwork showing tab saving and restoration; preserved the original brand icon and a high-resolution master.
- Re-rendered bilingual store screenshots at 3x pixel density and enlarged the actual interface. Keep one 1280×800 public set per language; 2560×1600 review copies stay local.
- Added website-only GitHub Pages preparation so the public privacy page can be published separately from extension source.

- Added a local Buy Me a Coffee button and QR linking to the developer's public page; no third-party scripts or remote fonts are loaded.
- Kept publisher preparation notes and raw verification captures out of the public file tree; documentation deployment is manually triggered.

- Added JSON import with minimal required fields, local preview and new-window/current-window restoration.
- Restored native group names, colors and collapsed states with duplicate URL retention, background progress, stop support and partial-failure reports.
- Added structural validation, URL allowlisting and virtual import previews; updated bilingual privacy and publishing documentation.

- Refined the popup, settings and about page with neutral themes, clearer sections, consistent controls and Chinese typography inspired by shadcn/ui.
- Fixed native embedded settings overflow by using stable document dimensions and reserving translated description/status space.

- Added a Simplified Chinese / English popup with light and dark themes and local language settings.
- Added checkboxes for multiple windows, groups and individual tabs, with mixed group states and selected counts.
- Preserved choices across window changes and refresh within the popup; virtual lists support large tab/window collections without a fixed count cap.
- Increased popup width to 500px and enlarged the tab selection area within Chrome’s 600px popup height.
- Updated publisher and MIT attribution to Chai Wang.
- Added an option to exclude ungrouped tabs, normal-window filtering and explicit incognito exclusion.
- Defined portable JSON schema version 1 and removed unused browser metadata from exports.
- Escaped Markdown titles and URLs; non-web schemes are represented as text.
- Moved requested exports to a service worker with document-independent download contents.
- Added optional local sponsor configuration, privacy disclosures, original icons and store materials.
- Added unit/browser tests, deterministic packaging, CI and documentation hosting workflows.

## Prototype 0.1.0

The original five-file prototype remains at the author's local `save_group` directory. Its raw browser-object JSON output is superseded by schema version 1. There was no Chrome Web Store release of that prototype in this repository.
