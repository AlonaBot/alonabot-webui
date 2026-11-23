# alonabot-webui 0.3.2 - 2026-11-23

### Fixed

- When you add an account, the form now starts with the defaults the adapter declares. See [PR #18](https://github.com/AlonaBot/alonabot-webui/pull/18).
  - OneBot 11 defaults to forward mode, so the WebSocket URL field appears.
  - The media folder, media URL and bot QQ number fields now have readable names.
- Plugin details no longer show the Configuration, Scheduled jobs or Database tab when there is nothing to show. If a component has no database file yet, data and storage show empty lists instead of a `no such file or directory` error. See [PR #18](https://github.com/AlonaBot/alonabot-webui/pull/18).
- While loading, plugin details and the overview show placeholders. They no longer show the component ID first and then switch to its name. See [PR #18](https://github.com/AlonaBot/alonabot-webui/pull/18).
- Display fixes (see [PR #18](https://github.com/AlonaBot/alonabot-webui/pull/18)):
  - On the profile page, the Model, Chat and Tools groups use the same heading and card layout.
  - Page titles and form labels use consistent sizes.
  - The selected-tab line, plugin card titles, disclosure titles and icon buttons now display correctly.

### Removed

- The full JSON configuration editor under a plugin's Advanced tab. To change settings, use the form on the Configuration tab.

### Distribution and upgrade

- Works with Core v0.3.0. You can update directly from 0.3.0 or 0.3.1; configuration and data are kept.
