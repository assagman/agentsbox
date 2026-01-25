# Quick Merge Flow

> For AI coding agents and developers: Follow these steps to merge uncommitted changes from `main` branch into the repository without triggering a release.

## Prerequisites

- Uncommitted changes in `main` branch (tested, working)
- `gh` CLI authenticated with repo access
- Admin privileges on the repository (for bypassing review requirements)

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           QUICK MERGE FLOW                                  │
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
│  │ 4. Wait for CI   │◄──── Poll until pass/fail                             │
│  └────────┬────────┘                                                        │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │ 5. Squash Merge  │──── Use --admin to bypass review                      │
│  └────────┬────────┘                                                        │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │ 6. Pull main     │                                                       │
│  └────────┬────────┘                                                        │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │ 7. Cleanup       │                                                       │
│  └─────────────────┘                                                        │
│           │                                                                 │
│           ▼                                                                 │
│  [Merged to main] ✅                                                        │
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

### Step 3: Create Pull Request

```bash
gh pr create \
  --title "<type>(<scope>): <description>" \
  --body "## Summary
<describe the changes>" \
  --base main
```

**Capture PR number from output** (e.g., `https://github.com/owner/repo/pull/8` → PR #8)

### Step 4: Wait for CI

```bash
# Poll until CI completes
while true; do
  status=$(gh pr checks <PR_NUMBER> 2>&1)
  echo "$status"
  if echo "$status" | grep -q "pass"; then
    echo "CI passed!"
    break
  elif echo "$status" | grep -q "fail"; then
    echo "CI failed!"
    exit 1
  fi
  sleep 5
done
```

### Step 5: Squash & Merge

```bash
# Merge with admin privileges (bypasses review requirement)
gh pr merge <PR_NUMBER> --squash --admin
```

### Step 6: Checkout Main & Pull

```bash
git checkout main
git pull origin main
```

### Step 7: Cleanup

```bash
# Delete local feature branch
git branch -d <branch-name>

# Verify current state
git log --oneline -3
```

## Complete Example

```bash
# === SETUP ===
BRANCH="docs/add-release-flow-docs"
COMMIT_MSG="docs: add release flow documentation"

# === STEP 1: Create branch ===
git checkout -b "$BRANCH"

# === STEP 2: Commit & Push ===
git add -A
git commit -s -m "$COMMIT_MSG"
git push -u origin "$BRANCH"

# === STEP 3: Create PR ===
PR_URL=$(gh pr create --title "$COMMIT_MSG" --body "Add release workflow documentation" --base main)
PR_NUMBER=$(echo "$PR_URL" | grep -oE '[0-9]+$')

# === STEP 4: Wait for CI ===
while ! gh pr checks "$PR_NUMBER" 2>&1 | grep -q "pass"; do sleep 5; done

# === STEP 5: Merge ===
gh pr merge "$PR_NUMBER" --squash --admin

# === STEP 6: Pull main ===
git checkout main && git pull origin main

# === STEP 7: Cleanup ===
git branch -d "$BRANCH"
git log --oneline -3
```

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| `CI failed` | Tests/lint failed | Fix issues, amend commit, force push |
| `base branch policy prohibits merge` | Review required | Use `--admin` flag |

## AI Agent Instructions

When executing this flow:

1. **Always verify current state** before starting (branch, uncommitted changes)
2. **Capture PR number** from `gh pr create` output
3. **Poll with timeouts** - don't wait forever (recommend 120s max)
4. **Handle failures gracefully** - report which step failed and why
5. **Confirm final state** - show recent commits after merge
