# Using WebUI

[简体中文](usage.zh-CN.md)

Install the official WebUI on Core v0.3.0 or later, open the Core address (default `http://127.0.0.1:7650`), and sign in with its management token. See [Core deployment](https://github.com/AlonaBot/AlonaBot/blob/main/docs/deployment.md) for authentication, listen addresses, proxies, and deployment settings.

The sidebar opens overview, plugins, accounts, models, profiles, conversations, logs, permissions, and system settings. Install components from the plugin store, configure adapter instances under accounts, manage providers and models under models, and use profiles to select conversation settings and tool policies.

Logs display business summaries by default. Expand **Details** on a record to inspect its complete structured fields, Trace, source location and error. Live and historical records share source, level and search filters; search also matches detail fields and Trace. Legacy text logs retain their original precision.

When an adapter provides a setup page, select **Account settings** while adding or editing an account to scan a QR code or authorize the account. Review the marked changes in the form, then select **Save**.

Plugin details expose configuration, jobs, plugin pages, database tables, KV/file storage, export, and clearing. Agent entries include conversation summaries and clearing; its pages show conversation contents and memory. Confirm the target and retain needed backups before clearing data.

Configuration forms edit `pending.config ?? active` and save with `active_generation`. A 409 response preserves the draft and allows explicitly adopting the latest configuration. Secret changes require reauthentication. The interface supports English and Simplified Chinese, themes, sidebar order and visibility, global search, and mobile navigation.

The browser calls the Admin API with same-origin Cookie/CSRF authentication. The WebUI backend communicates with Core through the SDK and uses managed SQLite for statistics, user directories, store caches, and read-version state. Full backend verification needs both static assets and the Go process installed; see [development](development.md).
