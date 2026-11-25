# alonabot-webui 0.3.0 - 2026-11-23

First-run token claim, source builds, download settings and session access need the management API introduced in Core v0.3.0.

### Added

- On first visit to a Docker deployment, the management token opens in a dialog; checking "I have saved it" closes it and signs in. The sign-in page can keep you signed in on this device ([#10](https://github.com/AlonaBot/alonabot-webui/pull/10)).
- The store can switch plugin sources (GitHub, jsDelivr, a custom mirror). Manual installation accepts an uploaded archive, a repository, or a build from source, with build steps and logs shown ([#10](https://github.com/AlonaBot/alonabot-webui/pull/10)).
- System settings configure the GitHub download mirror, API base, Go toolchain download base, GOPROXY and network proxy ([#9](https://github.com/AlonaBot/alonabot-webui/pull/9)).
- The models page manages connections by provider and picks models separately, with discovery, search, select all, select none and invert.
- Profiles gain session access under "Platforms and messages": allow all, allow only, or block selected sessions ([#11](https://github.com/AlonaBot/alonabot-webui/pull/11)).
- Add a conversations page; account configuration can be edited, not only added.
- When an Adapter declares an account configuration page, the add and edit account dialogs show "Account settings" and fill the page's result into the form before saving ([#14](https://github.com/AlonaBot/alonabot-webui/pull/14)).

### Changed

- WebUI supports dark mode and phone layouts, with a collapsible sidebar you can reorder by dragging. Existing content stays visible during refreshes ([#10](https://github.com/AlonaBot/alonabot-webui/pull/10)).
- Plugin extension pages open directly; plugin configuration is grouped into cards without exposing JSON.
- Secret fields are inputs with a visibility toggle; leaving one empty keeps the stored value.
- Building from source explains memory requirements and links to GOPROXY and proxy settings when downloads are blocked ([#12](https://github.com/AlonaBot/alonabot-webui/pull/12)).

### Removed

- System settings no longer edit denied chats; use session access in profiles instead ([#11](https://github.com/AlonaBot/alonabot-webui/pull/11)).
