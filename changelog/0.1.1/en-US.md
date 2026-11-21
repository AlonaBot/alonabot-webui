# alonabot-webui 0.1.1

## Added

- Plugin store publishing form: enter a repository, check its latest release, then submit the entry to the selected source through a prefilled GitHub issue.
- `GET /store/check` backend route that reports the resolved component identity of a published release without storing anything.
- Store role filters with per-role counts, name/stars sorting, and the nine-card paging layout.
- Refresh control in the store. Entering the store, switching source and pressing refresh fetch a new snapshot; search, role, sort and paging reuse the stored snapshot without contacting GitHub.

## Changed

- Store search now covers tags in addition to name, description, repository and author.
- Installed cards keep both the update action and the details entry, so a component installed from another source is still reachable.
- The store always shows the snapshot fetch time, and keeps the complete refresh error when a refresh fails while an earlier snapshot exists.
- First sign-in on the host machine claims the pending admin token for the operator to save, and page reloads restore the existing admin session.

## Fixed

- Same-kind replacement relies on the Core confirmation result; an Adapter conflict reported as `ALREADY_EXISTS` now offers the `Replace` path instead of only showing an error.
- The publishing check no longer reports "no release" for a broken release asset; only a missing `releases/latest` endpoint means no release.
- A package whose manifest source differs from `release.json` is now rejected by the store check, matching the Core install preflight.
- Malformed saved plugin sources surface their actual error instead of silently falling back to the default source.
- Store filters, pagination and source actions stay locked while a refresh is in flight, so a completed refresh is no longer discarded.
