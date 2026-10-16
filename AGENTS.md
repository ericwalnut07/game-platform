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
| Shared game core, WebSocket, Durable Objects, persistence, auth, hidden information, migrations, or cross-game components | Full `npm.cmd run verify` and CI; include both PC and mobile |
| Release integration and production deployment | Full `npm.cmd run verify`, GitHub Actions and applicable deployment checks before deployment |

Raise the level when a change affects multiple games, exposes hidden data, changes state compatibility, produces flaky/ambiguous results, or focused tests reveal regressions. Security, server authority, information isolation, reconnect and duplicate-request safety must not be compromised for speed. Keep existing tests for affected features; do not falsely report a focused run as a full pass.

For small PRs, run focused verification and let GitHub Actions provide additional feedback; full Windows verification is **not required for every intermediate PR**. Before a production release, run full verification on the exact integrated candidate (including desktop and mobile E2E) and confirm GitHub Actions; fix failures before deployment. If CI policy mandates a full suite for a PR, comply; do not bypass branch protections.

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

Use focused commands according to the risk matrix above. For full verification, run:

```powershell
npm.cmd run verify
```

The full command continues to cover preflight, TypeScript, unit tests, simulation smoke, migration checks, production build, desktop Chromium E2E and mobile Chromium E2E.

After verification:
- Report exact commit, each check performed, outcome, failed test names and any intentionally omitted checks with reason.
- If Playwright output is interrupted, inspect `test-results/.last-run.json`; never infer success without an exit code or passing formal result.
- Do not commit generated build output, Playwright results, Wrangler state or secrets.
- Restore checkout to `main` when practical without disturbing local files.

## Safety boundaries

- Do not deploy, apply remote D1 migrations, change Cloudflare secrets, or install a self-hosted GitHub Actions runner unless the user explicitly requests that action.
- Local D1 migrations used by Playwright are allowed because they target Wrangler's local state.
