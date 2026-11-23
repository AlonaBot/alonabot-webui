# Packaging and releases

[简体中文](releasing.zh-CN.md)

Prepare the locked SDK CLI following [development](development.md). The five supported targets are linux/amd64, linux/arm64, windows/amd64, darwin/amd64, and darwin/arm64.

```fish
npm ci
npm run typecheck
npm run build
alonabot check .
alonabot pack . --target linux/amd64 --out bin
```

Maintainers prepare `plugin.yaml` and `changelog/<version>/en-US.md` plus `zh-CN.md`. After review, publish the matching `v<version>` tag. The release workflow checks the version, builds five archives, verifies their LICENSE, and publishes notes under `## English` and `## 简体中文`. It removes the first version heading and uses `###` for category headings while retaining body text and fenced code.

Release assets contain platform `.tar.gz` archives; GitHub provides source downloads. Core reads component identity and version from the packaged `plugin.yaml` and binds the repository source. Upgrade Core to v0.3.0 before installing or updating formal components; stop the component and back up its data before replacement, retaining its ID, source, and data directory.

[Core release maintenance](https://github.com/AlonaBot/AlonaBot/blob/main/docs/releasing.md)
