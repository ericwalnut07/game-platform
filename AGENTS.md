# AGENTS.md

## Source of truth

- Treat GitHub as the source of truth for this repository.
- Make code, configuration, and documentation changes through the GitHub integration on a dedicated branch and pull request.
- Use the Windows desktop only as a verification machine. Do not push from the desktop checkout.
- Never read, print, copy or commit secrets from `.dev.vars`.

## Development pace and verification levels

**Default to fast, change-scoped development.** Avoid whole-repository re-analysis, repetitive tool calls, unnecessary simulations, and full E2E suites for each small change. Check current main, this file, relevant existing PRs and only the source files materially related to the change. Keep logs and reporting concise (commit, commands, pass/fail, failures, deliberately skipped checks).

Choose the minimum appropriate validation by the *highest-risk* affected area:

| Change class | Minimum validation during development |
| --- | --- |
| Docs, copy, CSS, presentational layout only | Relevant static/visual review; build if application files changed |
| Game-specific UI controls or rendering | Typecheck, relevant tests, focused PC/mobile interaction check |
| Game-specific rule, scoring, or NPC logic | Typecheck, relevant unit tests, focused smoke or short simulation; check affected player views |
| Shared game core, WebSocket, Durable Objects, persistence, auth, hidden information, migrations, or cross-game components | Validate the affected game(s) and the changed shared mechanisms; do not automatically add unrelated games |
| Release integration and production deployment | Run the target game's relevant Unit, smoke, desktop/mobile E2E, build, applicable migration and deployment checks; do not automatically test unrelated games |

Raise the level when a change affects multiple games, exposes hidden data, changes state compatibility, produces flaky/ambiguous results, or focused tests reveal regressions. Security, server authority, information isolation, reconnect and duplicate-request safety must not be compromised for speed. Keep existing tests for affected features; do not falsely report a focused run as a full pass.

For small PRs, run focused verification and let GitHub Actions provide additional feedback; full Windows verification is **not required for every intermediate PR**. Before a production release, verify the exact integrated candidate for the **requested game(s)** (including applicable desktop/mobile E2E), and confirm the corresponding GitHub Actions; fix failures before deployment. Other games' test suites are added **only if the user explicitly requests them**. Shared infrastructure checks (typecheck, build, migration integrity, security and health where applicable) remain allowed and do not imply running other games' E2E. Never claim all-game coverage when only a game-scoped suite ran. If CI policy mandates a full suite for a PR, comply; do not bypass branch protections.

When a previous full run applies to an unchanged exact commit, reuse its recorded result rather than rerunning it needlessly. Avoid unrequested large statistical experiments; if balance data is necessary, start with the smallest reasonable sample, and identify its limits. Present meaningful progress and failures without dumping lengthy test output.

## Windows verification target

- Remote Desktop Commander device: `ericwalnut`
- Repository: `C:\Users\hs902\game-platform`
- PowerShell may block `npm.ps1`; invoke npm as `npm.cmd`.

## Windows verification procedure

Before running any checks on the desktop:

1. Confirm the device is online.
2. Run `git status --short --branch`.
3. If tracked files have local changes, or an untracked file would conflict with checkout, stop and report it. Never reset, clean, delete, stash, or overwrite user work.
4. Run `git fetch --prune origin`.
5. Check out the exact remote branch or commit being verified without modifying it locally.

Use focused commands according to the risk matrix above. For explicitly requested all-game verification only, run:

```powershell
npm.cmd run verify
```

The legacy all-game command continues to cover preflight, TypeScript, unit tests, simulation smoke, migration checks, production build, desktop Chromium E2E and mobile Chromium E2E.

After verification:
- Report exact commit, each check performed, outcome, failed test names and any intentionally omitted checks with reason.
- If Playwright output is interrupted, inspect `test-results/.last-run.json`; never infer success without an exit code or passing formal result.
- Do not commit generated build output, Playwright results, Wrangler state or secrets.
- Restore checkout to `main` when practical without disturbing local files.

## Safety boundaries

- Do not deploy, apply remote D1 migrations, change Cloudflare secrets, or install a self-hosted GitHub Actions runner unless the user explicitly requests that action.
- Local D1 migrations used by Playwright are allowed because they target Wrangler's local state.

## Game-scoped CI and release selection

Default scope for both PR verification **and production release** is the game explicitly being implemented or released. Do not run the E2E, game-specific Unit tests, or game simulations of unrelated games as a prerequisite. Include another game's tests only when the user explicitly asks. For cross-game infrastructure work, check shared mechanism safety and the requesting game's flows without automatically enrolling every game's full suite. Document the selected scope and any shared checks in the PR/release report.

A future automated test selector must be fail-closed: identify the targeted game from the user request or an explicit PR/release input; reject missing/unknown selections instead of silently skipping tests. Keep independent build/typecheck/migration checks as necessary. GitHub required-status checks and protected-branch policies must continue to be satisfied; adapt CI job definitions rather than bypass protections. The full all-game suite may remain available as an explicit opt-in command, but is no longer a default condition for release.
