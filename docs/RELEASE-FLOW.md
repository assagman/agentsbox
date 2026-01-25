# Automated Release Flow

> For AI coding agents and developers: Follow these steps sequentially to release uncommitted changes from `main` branch to npm.

## Prerequisites

- Uncommitted changes in `main` branch (tested, working, ready to ship)
- `gh` CLI authenticated with repo access
- `jq` for parsing JSON output

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RELEASE FLOW                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [Uncommitted changes in main]                                              │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │ 1. Create branch │                                                       │
│  └────────┬────────┘                                                        │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │ 2. Commit & Push │                                                       │
│  └────────┬────────┘                                                        │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │ 3. Create PR     │                                                       │
│  └────────┬────────┘                                                        │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │ 4. Wait for CI   │◄──── Use --watch for robustness                       │
│  └────────┬────────┘                                                        │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │ 5. Squash Merge  │──── Requires approval or --admin override             │
│  └────────┬────────┘                                                        │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │ 6. Pull main     │                                                       │
│  └────────┬────────┘                                                        │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │ 7. Trigger       │                                                       │
│  │    Release WF    │──── patch | minor | major | auto                      │
│  └────────┬────────┘                                                        │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │ 8. Wait for WF   │◄──── Poll with failure detection                       │
│  └────────┬────────┘                                                        │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │ 9. Merge Release │──── Requires approval or --admin override             │
│  │    PR            │                                                       │
│  └────────┬────────┘                                                        │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │ 10. Wait Publish │◄──── Poll with failure detection                       │
│  └────────┬────────┘                                                        │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │ 11. Cleanup      │                                                       │
│  └─────────────────┘                                                        │
│           │                                                                 │
│           ▼                                                                 │
│  [Published to npm] ✅                                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Step-by-Step Commands

### Step 1: Verify State & Create Branch

```bash
# Verify you have uncommitted changes in main
git status --short
git branch --show-current  # Should be: main

# Create feature/fix branch
git checkout -b <branch-name>
# Example: git checkout -b fix/native-module-bundling
```

**Branch naming conventions:**
| Type | Pattern | Example |
|------|---------|---------|
| Bug fix | `fix/<description>` | `fix/native-module-bundling` |
| Feature | `feat/<description>` | `feat/add-retry-logic` |
| Docs | `docs/<description>` | `docs/update-readme` |
| Chore | `chore/<description>` | `chore/update-deps` |

### Step 2: Commit & Push

```bash
# Stage and commit with sign-off
git add -A
git commit -s -m "<type>(<scope>): <description>

<optional body explaining the change>"

# Push and set upstream
git push -u origin <branch-name>
```

**Commit message format:**
```
<type>(<scope>): <short description>

<optional longer description>
```

### Step 3: Create Pull Request

```bash
gh pr create \
  --title "<type>(<scope>): <description>" \
  --body "## Problem
<describe the problem>

## Solution
<describe the fix>

## Testing
<how it was tested>" \
  --base main
```

**Capture PR number from output** (e.g., `https://github.com/owner/repo/pull/8` → PR #8)

### Step 4: Wait for CI

```bash
# Wait for CI to complete (automatic polling with failure detection)
gh pr checks <PR_NUMBER> --watch
```

### Step 5: Squash & Merge

```bash
# Merge when approved
gh pr merge <PR_NUMBER> --squash
```

> **Note:** If you have admin rights and need to bypass review requirements in an emergency, you can append `--admin` to the merge command.

### Step 6: Checkout Main & Pull

```bash
git checkout main
git pull origin main
```

### Step 7: Trigger Release Workflow

```bash
# Trigger with version type: auto | patch | minor | major
gh workflow run "Create Release PR" -f version_type=auto
```

| Version Type | When to Use |
|--------------|-------------|
| `auto` | Automatically determine bump based on conventional commits |
| `patch` | Bug fixes, minor changes (0.1.2 → 0.1.3) |
| `minor` | New features, backward compatible (0.1.2 → 0.2.0) |
| `major` | Breaking changes (0.1.2 → 1.0.0) |

### Step 8: Wait for Release Workflow

```bash
# Wait for workflow run to appear
sleep 5
while [ "$(gh run list --workflow='Create Release PR' -L 1 --json status -q 'length')" -eq 0 ]; do
  sleep 5
done

# Poll until workflow completes
while true; do
  status=$(gh run list --workflow="Create Release PR" -L 1 --json status,conclusion -q '.[0]')
  conclusion=$(echo "$status" | jq -r '.conclusion // empty')
  if [ "$conclusion" = "success" ]; then
    echo "Workflow completed!"
    break
  elif [[ "$conclusion" = "failure" || "$conclusion" = "cancelled" || "$conclusion" = "skipped" ]]; then
    echo "Workflow failed with conclusion: $conclusion"
    exit 1
  fi
  sleep 5
done

# Fetch the new release branch
git fetch origin
```

### Step 9: Merge Release PR

```bash
# Find the release PR number specifically for release branch
RELEASE_PR=$(gh pr list --state open --head "release-v*" --json number -q '.[0].number')
if [ -z "$RELEASE_PR" ]; then
  echo "Error: Could not find an open release PR." >&2
  exit 1
fi

# Merge release PR
gh pr merge "$RELEASE_PR" --squash
```

### Step 10: Wait for Publish Workflow

```bash
# Wait for workflow run to appear
sleep 5
while [ "$(gh run list --workflow='Publish Release' -L 1 --json status -q 'length')" -eq 0 ]; do
  sleep 5
done

# Poll until publish completes
while true; do
  status=$(gh run list --workflow="Publish Release" -L 1 --json status,conclusion -q '.[0]')
  conclusion=$(echo "$status" | jq -r '.conclusion // empty')
  if [ "$conclusion" = "success" ]; then
    echo "Publish completed!"
    break
  elif [[ "$conclusion" = "failure" || "$conclusion" = "cancelled" || "$conclusion" = "skipped" ]]; then
    echo "Publish failed with conclusion: $conclusion"
    exit 1
  fi
  sleep 5
done

# Verify release
gh release list -L 1
```

### Step 11: Cleanup

```bash
# Update main
git checkout main
git pull origin main

# Delete local branches
git branch -d <feature-branch-name>
git branch -d release-v<version>

# Verify published version
npm view agentsbox version
```

## Complete Example

```bash
# === SETUP ===
BRANCH="fix/native-module-bundling"
COMMIT_MSG="fix(build): externalize native clipboard modules"
VERSION_TYPE="patch"

# === STEP 1: Create branch ===
git checkout -b "$BRANCH"

# === STEP 2: Commit & Push ===
git add -A
git commit -s -m "$COMMIT_MSG"
git push -u origin "$BRANCH"

# === STEP 3: Create PR ===
PR_URL=$(gh pr create --title "$COMMIT_MSG" --body "Automated release" --base main)
PR_NUMBER=$(echo "$PR_URL" | grep -oE '[0-9]+$')

# === STEP 4: Wait for CI ===
gh pr checks "$PR_NUMBER" --watch

# === STEP 5: Merge ===
gh pr merge "$PR_NUMBER" --squash

# === STEP 6: Pull main ===
git checkout main && git pull origin main

# === STEP 7: Trigger release ===
gh workflow run "Create Release PR" -f version_type="$VERSION_TYPE"

# === STEP 8: Wait for release workflow ===
sleep 5
while [ "$(gh run list --workflow='Create Release PR' -L 1 --json status -q 'length')" -eq 0 ]; do sleep 5; done
while true; do
  conclusion=$(gh run list --workflow='Create Release PR' -L 1 --json conclusion -q '.[0].conclusion // empty')
  if [ "$conclusion" = "success" ]; then
    break
  elif [[ "$conclusion" = "failure" || "$conclusion" = "cancelled" || "$conclusion" = "skipped" ]]; then
    echo "'Create Release PR' workflow failed with conclusion: $conclusion"
    exit 1
  fi
  sleep 5
done

# === STEP 9: Merge release PR ===
git fetch origin
RELEASE_PR=$(gh pr list --state open --head "release-v*" --json number -q '.[0].number')
if [ -z "$RELEASE_PR" ]; then
  echo "Error: Could not find an open release PR." >&2
  exit 1
fi
gh pr merge "$RELEASE_PR" --squash

# === STEP 10: Wait for publish ===
sleep 5
while [ "$(gh run list --workflow='Publish Release' -L 1 --json status -q 'length')" -eq 0 ]; do sleep 5; done
while true; do
  conclusion=$(gh run list --workflow='Publish Release' -L 1 --json conclusion -q '.[0].conclusion // empty')
  if [ "$conclusion" = "success" ]; then
    break
  elif [[ "$conclusion" = "failure" || "$conclusion" = "cancelled" || "$conclusion" = "skipped" ]]; then
    echo "'Publish Release' workflow failed with conclusion: $conclusion"
    exit 1
  fi
  sleep 5
done

# === STEP 11: Cleanup ===
git checkout main && git pull origin main
RELEASE_BRANCH_NAME=$(gh pr view "$RELEASE_PR" --json headRefName -q '.headRefName')
git branch -d "$BRANCH"
if [ -n "$RELEASE_BRANCH_NAME" ]; then git branch -d "$RELEASE_BRANCH_NAME"; fi
gh release list -L 1
npm view agentsbox version
```

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| `CI failed` | Tests/lint failed | Fix issues, amend commit, force push |
| `base branch policy prohibits merge` | Review required | Obtain required approvals or use `--admin` if authorized |
| `Workflow failed` | Build/publish error | Check workflow logs: `gh run view <run-id> --log` |
| `Auto merge not allowed` | Repo setting | Use `--admin` instead of `--auto` if authorized |

## AI Agent Instructions

When executing this flow:

1. **Always verify current state** before starting (branch, uncommitted changes)
2. **Capture IDs/numbers** from command outputs (PR numbers, run IDs)
3. **Poll with timeouts** - don't wait forever (recommend 120s max per poll loop)
4. **Handle failures gracefully** - report which step failed and why
5. **Confirm final state** - verify the npm version matches expected release
