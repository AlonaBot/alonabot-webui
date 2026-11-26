# Contributing

[简体中文](CONTRIBUTING.zh-CN.md)

Follow this repository's [coding standards](docs/coding-standards.md) (synced from Core) and the Core [contribution process](https://github.com/AlonaBot/AlonaBot/blob/main/CONTRIBUTING.md). Submit changes to this component here; larger changes need maintainer agreement on an Issue, and new dependencies need explicit approval.

Use Simplified Chinese for code comments, internal maintenance notes, and commit messages; keep logs, errors, identifiers, and CLI output in English. Provide public usage and developer guides in English and Simplified Chinese. PR titles follow `type/scope: 中文摘要`; complete the [PR template](.github/PULL_REQUEST_TEMPLATE.md) in English or Chinese with actual verification and risks.

The coding standards govern naming, boundary validation, errors, compatibility, and test submission; differences from Core are listed in their repository differences. Commit integration tests for real entry points; keep temporary unit and SDK boundary checks local. State added test lines and local results in the PR. Redact credentials and real user data; use the [private security channel](https://github.com/AlonaBot/AlonaBot/security/advisories/new) for vulnerabilities and [Discussions](https://github.com/AlonaBot/AlonaBot/discussions) for usage questions.

## Component differences

The public entry is `admin.go`; implementation lives in `internal/admin/`. Preserve public import paths and update the generator source before regenerating resources.

See [development](docs/development.md) for the exact toolchain, generator, frontend, and component commands. CI always checks the commit range for whitespace, then selects Go, frontend, and component checks from changed paths. WebUI builds static assets before component validation.

Coordinate cross-component behavior changes with the Core maintainers for the component lock and integration checks. [Packaging and releases](docs/releasing.md) describes the maintainer workflow.

Contributions use the [MIT License](LICENSE).
