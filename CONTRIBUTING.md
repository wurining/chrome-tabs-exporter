# Contributing

Use Node.js 22+, Python 3, and an isolated Chrome for Testing profile. Install development tools with `npm ci --ignore-scripts` and `npx playwright install chromium`, then run `npm run verify`.

Keep the extension as native HTML/CSS/JavaScript. Runtime code and assets must be packaged locally. Changes to data handling, permissions or network behavior require corresponding updates to the in-extension privacy text, both locales, published privacy page and store declarations.

Use `textContent` for tab and group titles. Do not add host permissions, telemetry, remote scripts, remote payment widgets or unrequested tab mutations. Keep all features available without payment.

Add tests for behavior changes to collection, export formatting, filtering, downloads or sponsor configuration. Run `npm run assets` after editing artwork or the public coffee URL; it derives the small promotional image from the approved `promo-master.png` and also regenerates the local QR image. Run `npm run locales` plus `npm run docs` after changing locale or privacy text. When changing the interface, run `npm run screenshots` and review both locales and themes. It renders at 3x device pixel density. Commit only the three 1280×800 store uploads per language under `docs/store-assets/en/` and `docs/store-assets/zh_CN/`. The 2560×1600 review copies go to `.local/screenshots/hd/`; raw captures and verification notes also stay in `.local/` and are not committed.

Version changes must update the manifest and package together. Review localized version/effective-date strings and changelog before release. The CI produces the store ZIP, but never submits an extension to the Chrome Web Store automatically.

Push an explicitly approved version tag such as `v1.0.0` to prepare a GitHub Release draft. The tag must match both the manifest and package version. After verification passes, the release job downloads that same run's CI artifact, checks the ZIP version and SHA-256 checksum, and attaches the ZIP and checksum file to the draft with notes from `CHANGELOG.md`. Ordinary pushes and pull requests only produce CI artifacts. Reruns may update a draft's attachments; they refuse to overwrite a published release. Publish the draft when the Chrome Web Store release is ready.

Please use public example URLs in fixtures and issues. Never attach private exported browsing data. Contributions are licensed under MIT.

Follow [AGENTS.md](AGENTS.md) for the public-file boundary, local output locations and remote publishing constraints. Contributions do not grant repository management access.

`npm run pages:prepare` creates a local website-only file tree under `.local/github-pages-site/`, with the public pages and the Pages workflow. The workflow deploys only the already generated `docs/site/` files after each push to `main`, and also supports manual runs from `main`. Run `npm run docs` when changing the locale resources or sponsor configuration so the generated public pages stay current. This preparation command never pushes or deploys.
