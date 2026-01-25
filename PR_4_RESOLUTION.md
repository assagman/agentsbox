# PR_4_RESOLUTION

## PR Metadata

| Field | Value |
|------:|-------|
| Repo | assagman/agentsbox |
| PR | #4 |
| Title | fix(pi): install extension as symlinked directory |
| URL | https://github.com/assagman/agentsbox/pull/4 |
| Generated at | 2026-01-24T21:10:00Z |

## Summary

| Category | Count |
|---------:|------:|
| Unresolved threads (initial) | 13 |
| Resolved as INVALID | 4 |
| VALID (planned work) | 9 |
| UNCLEAR (needs user input) | 0 |

## VALID Threads → Work Plan

> Goal: address each VALID thread with code changes + tests, then reply/resolve those threads in the PR.

### 1) Update cli-setup-pi dry-run expectations to new directory symlink behavior (Gemini)

- Thread: https://github.com/assagman/agentsbox/pull/4#discussion_r2724594205
- Files:
  - `test/unit/cli-setup-pi.test.ts`:47
- What reviewer claims:
  - Tests still assume old behavior (file symlink to `pi.js`) instead of directory symlink to `dist/pi-extension`.
- Work items:
  1. Update assertions to expect:
     - `~/.pi/agent/extensions/agentsbox` (NOT `.js`)
     - symlink target contains `dist/pi-extension` (NOT `dist/pi.js`)
  2. Keep existing skill symlink assertion (`~/.pi/agent/skills/agentsbox`).
- Acceptance criteria:
  - [ ] `bun test` passes.

---

### 2) Update cli-setup-pi test: extension path should be `agentsbox` not `agentsbox.js` (Copilot)

- Thread: https://github.com/assagman/agentsbox/pull/4#discussion_r2724596028
- Files:
  - `test/unit/cli-setup-pi.test.ts`:45
- Work items:
  1. Replace `~/.pi/agent/extensions/agentsbox.js` expectation with `~/.pi/agent/extensions/agentsbox`.
- Acceptance criteria:
  - [ ] Test matches `src/cli.ts` `planSetupPi()` output.

---

### 3) Update cli-setup-pi test: target should mention `dist/pi-extension` not `dist/pi.js` (Copilot)

- Thread: https://github.com/assagman/agentsbox/pull/4#discussion_r2724596035
- Files:
  - `test/unit/cli-setup-pi.test.ts`:47
- Work items:
  1. Replace `dist/pi.js` expectation with `dist/pi-extension`.
- Acceptance criteria:
  - [ ] Test matches `src/cli.ts` `planSetupPi()` (symlink from `dist/pi-extension`).

---

### 4) Update cli-setup-pi test (second test case): extension path should be `agentsbox` not `agentsbox.js` (Copilot)

- Thread: https://github.com/assagman/agentsbox/pull/4#discussion_r2724596040
- Files:
  - `test/unit/cli-setup-pi.test.ts`:82
- Work items:
  1. Replace `~/.pi/agent/extensions/agentsbox.js` expectation with `~/.pi/agent/extensions/agentsbox`.
- Acceptance criteria:
  - [ ] `--dry-run prints plan even when dist is missing` still passes.

---

### 5) Update cli-setup-pi test (second test case): target should mention `dist/pi-extension` not `dist/pi.js` (Copilot)

- Thread: https://github.com/assagman/agentsbox/pull/4#discussion_r2724596043
- Files:
  - `test/unit/cli-setup-pi.test.ts`:83
- Work items:
  1. Replace `dist/pi.js` expectation with `dist/pi-extension`.
- Acceptance criteria:
  - [ ] Test matches updated CLI plan output.

---

### 6) Refactor `package.json` build script into a dedicated script (Gemini)

- Thread: https://github.com/assagman/agentsbox/pull/4#discussion_r2724594209
- Files:
  - `package.json`:23
- What reviewer claims:
  - Build script is long; move pi-extension creation logic out.
- Work items:
  1. Add a small build helper script, e.g. `scripts/prepare-pi-extension.mjs`.
  2. Update `package.json` `build` to:
     - run `bun build ...`
     - then run the helper script.
- Acceptance criteria:
  - [ ] `bun run build` produces `dist/pi-extension/package.json` and `dist/pi-extension/index.js`.

---

### 7) Make build portable beyond POSIX shells (Copilot)

- Thread: https://github.com/assagman/agentsbox/pull/4#discussion_r2724596049
- Files:
  - `package.json`:23
- What reviewer claims:
  - `mkdir -p`, `ln -sf`, and `echo >` are not Windows-friendly.
- Work items (recommended approach):
  1. In the helper script, avoid shell utilities entirely.
  2. Avoid symlinks if possible (Windows symlink perms): write a real JS file instead of `ln -sf`:
     - `dist/pi-extension/index.js` content: `export { default } from "../pi.js";`.
  3. Create `dist/pi-extension/package.json` via `fs.writeFile`.
- Acceptance criteria:
  - [ ] `bun run build` runs under Windows shells without requiring POSIX utilities.

---

### 8) Ensure build fails cleanly / use proper error handling (Copilot)

- Thread: https://github.com/assagman/agentsbox/pull/4#discussion_r2724596052
- Files:
  - `package.json`:23
- What reviewer claims:
  - `&&` chain + `ln -sf` can leave inconsistent state.
- Work items:
  1. Ensure helper script throws on failure and exits non-zero.
  2. Make helper script idempotent (re-create files safely).
- Acceptance criteria:
  - [ ] Any failure in pi-extension preparation makes `bun run build` fail.

---

### 9) Make build script portable beyond POSIX shells (ChatGPT Codex)

- Thread: https://github.com/assagman/agentsbox/pull/4#discussion_r2724598286
- Files:
  - `package.json`:23
- Work items:
  1. Same as items (6)-(8): move logic to helper script and remove POSIX shell dependency.
- Acceptance criteria:
  - [ ] No `mkdir -p` / `ln -sf` / `echo` in `package.json` scripts.

---

## INVALID Threads (resolved)

### A) Legacy symlink test update request (Gemini) — resolved

- Thread: https://github.com/assagman/agentsbox/pull/4#discussion_r2724594208
- Reply used:
  - Already updated test/unit/cli-symlink-broken.test.ts to match new directory symlink behavior (piDest=~/.pi/agent/extensions/agentsbox) and no longer rely on agentsbox.js. This thread is now outdated.
- Rationale:
  - Test was already updated in this PR diff.

### B) cli-symlink-broken: change agentsbox.js → agentsbox (Copilot) — resolved

- Thread: https://github.com/assagman/agentsbox/pull/4#discussion_r2724596016
- Reply used:
  - Already updated cli-symlink-broken test to use ~/.pi/agent/extensions/agentsbox (directory symlink) instead of agentsbox.js. Resolving as outdated.
- Rationale:
  - Covered by existing changes in `test/unit/cli-symlink-broken.test.ts`.

### C) cli-symlink-broken: expect dist/pi-extension not dist/pi.js (Copilot) — resolved

- Thread: https://github.com/assagman/agentsbox/pull/4#discussion_r2724596025
- Reply used:
  - This expectation is already updated: the test now asserts the symlink points to dist/pi-extension (directory), not dist/pi.js (file). Marking this outdated thread resolved.
- Rationale:
  - Covered by existing changes in `test/unit/cli-symlink-broken.test.ts`.

### D) cli-symlink-broken: comment text mismatch (Copilot) — resolved

- Thread: https://github.com/assagman/agentsbox/pull/4#discussion_r2724596046
- Reply used:
  - Comment text has been updated to reflect current behavior (dangling symlink at agentsbox -> dist/pi-extension). Resolving this outdated thread.
- Rationale:
  - Comment already updated in diff.

## UNCLEAR Threads (questions)

None.

## Next Steps

1. Fix `test/unit/cli-setup-pi.test.ts` expectations for:
   - `~/.pi/agent/extensions/agentsbox` and `dist/pi-extension`.
2. Replace POSIX `build` script tail with a Node/Bun helper script that writes files (no symlinks).
3. Run `bun test` and re-check PR threads, then reply+resolve each remaining VALID thread.
