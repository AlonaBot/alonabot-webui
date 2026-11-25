# alonabot-webui 0.1.1

## Added

- The store lets you check a component's latest release and submit it through a prefilled GitHub issue. Integrations can use `GET /store/check` to look up the published component's identity.
- The store lists counts by role and lets you search tags, sort by name or stars, and browse nine cards per page. Searches and filters reuse the current snapshot. The page shows when it last fetched data and reports refresh failures without clearing earlier results.
- The first local sign-in lets you claim the pending admin token. Refreshing the page restores an existing admin session.

## Fixed

- When an adapter conflicts with one already installed, the store offers Replace after Core confirms the conflict. Installed cards still open details and offer updates.
- The store reports broken release assets and invalid saved plugin sources with their actual errors. Release checks reject packages whose manifest source differs from `release.json`.
