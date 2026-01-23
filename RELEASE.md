# Release process (WIP)

This repository is **not published yet** (package.json is `private: true`).

When publishing is desired:

1. Remove `"private": true` from `package.json`.
2. Decide on the publish target (npm scope/name) and update docs/schema IDs accordingly.
3. Add an actual release workflow (tags, changelog generation, publish automation).
