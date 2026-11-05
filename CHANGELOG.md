# Changelog

Every push to `master` publishes a new patch version to npm, so some
versions contain only documentation or CI changes.

## 1.0.12 (2026-11-03)

- Show a weekly npm downloads chart in the README, updated by a scheduled workflow

## 1.0.11 (2026-11-03)

- Remove the `signalk-webapp` keyword: the plugin has no web UI

## 1.0.10 (2026-07-09)

- Add a test suite (`npm test`, using `node:test`)
- Export `findLatestFrame`, `buildTileUrl`, `createProvider` and `fetchJson` for testing

## 1.0.9 (2026-07-09)

- Add a configuration schema (default opacity, refresh interval)
- Log an error instead of crashing when the initial fetch or provider registration fails
- Add screenshots to the plugin store metadata

## 1.0.8 (2026-07-09)

- Add a demo image to the README

## 1.0.7 (2026-07-09)

- Run the Signal K plugin CI workflow on pushes and pull requests

## 1.0.6 (2026-07-09)

- Update the plugin logo

## 1.0.5 (2026-07-09)

- Add `appIcon` to the Signal K metadata so the logo shows in the plugin store
- Restrict the published package to the files it needs

## 1.0.4 (2026-07-09)

- Fix CI version bump to start from the latest published version

## 1.0.3 (2026-07-09)

- CI: try committing the version bump back to the repository (since replaced in 1.0.4)

## 1.0.1 (2026-07-09)

- Publish to npm on every push to master
- Fix CI workflow: remove `npm ci`, use Node 22
- Add an npm publish badge and this changelog

## 1.0.0 (2026-06-26)

- Initial release
- Live RainViewer weather radar tiles as Signal K chart resources
