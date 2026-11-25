# alonabot-webui 0.3.2 - 2026-11-23

### Fixed

- New account forms start with the adapter's defaults. OneBot 11 defaults to forward mode, so the WebSocket URL field appears. The media and bot QQ number fields have clearer labels ([#18](https://github.com/AlonaBot/alonabot-webui/pull/18)).
- Plugin details hide tabs with nothing to show. A plugin without a database now shows empty data and storage lists. While loading, plugin details and the overview show placeholders in place of component IDs ([#18](https://github.com/AlonaBot/alonabot-webui/pull/18)).
- Profile groups, page titles and field labels are consistent, and selected tabs and disclosure buttons display correctly ([#18](https://github.com/AlonaBot/alonabot-webui/pull/18)).

### Removed

- Use the Configuration tab to edit plugin settings. The full JSON editor in Advanced has been removed ([#18](https://github.com/AlonaBot/alonabot-webui/pull/18)).
