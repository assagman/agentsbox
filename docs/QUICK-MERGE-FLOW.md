# Quick Merge Flow

> For AI coding agents and developers: Follow these steps to merge uncommitted changes from `main` branch into the repository without triggering a release.

## Prerequisites

- Uncommitted changes in `main` branch (tested, working)
- `gh` CLI authenticated with repo access
- `jq` for parsing JSON output (optional but recommended)

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
gh pr checks "$PR_NUMBER" --watch

# === STEP 5: Merge ===
# Requires manual approval or --admin override if permitted
gh pr merge "$PR_NUMBER" --squash

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
| `base branch policy prohibits merge` | Review required | Obtain required approvals or use `--admin` if authorized |

## AI Agent Instructions

When executing this flow:

1. **Always verify current state** before starting (branch, uncommitted changes)
2. **Capture PR number** from `gh pr create` output
3. **Poll with timeouts** - don't wait forever (recommend 120s max)
4. **Handle failures gracefully** - report which step failed and why
5. **Confirm final state** - show recent commits after merge
