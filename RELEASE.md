# Release process

Releases are automated via GitHub Actions.

## 1) Create a release PR

Trigger the workflow **Create Release PR** (`.github/workflows/release-pr.yml`) via `workflow_dispatch`.

It will:
- create a branch `release-vX.Y.Z`
- bump `package.json` version
- prepend a changelog entry to `CHANGELOG.md`
- open a PR labeled `release`

## 2) Merge the release PR

When the PR is merged into `main`, the **Publish Release** workflow (`.github/workflows/release-publish.yml`) runs (only for merged PRs with label `release`).

It will:
- install deps + build + run tests
- create and push a git tag `vX.Y.Z`
- create a GitHub Release
- publish to npm using OIDC trusted publishing (`npm publish --provenance --access public`)

## Local verification (recommended)

```bash
bun install
bun run check
bun run typecheck
bun test
bun run build
```
