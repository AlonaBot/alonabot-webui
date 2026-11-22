# alonabot-webui 0.2.0 - 2026-11-22

### Changed

- Install local components by uploading one platform archive. Store checks select GitHub Release assets and read `plugin.yaml` from the archive, retaining source, identity, version and platform checks.
- Remove manifest, signature and public-key upload fields. Use Core v0.2.0 for the archive installation API.

### Distribution and upgrade

- Publish five `.tar.gz` platform archives, including Windows amd64; GitHub supplies source archives. Standalone `release.json`, signatures and public-key assets are retired.
- Use the SDK and packager from reviewed Core commit `2dbbded7184f` (`v0.1.2-0.20261122021903-2dbbded7184f`), which contains the v0.2.0 archive installation flow. The component uses the MIT License.
- Upgrade Core to v0.2.0 before installing or updating this release. Stop the component and back up its data before replacement; retain the same component ID, source and data directory. Historical sidecar cleanup follows verification of Core and WebUI.
