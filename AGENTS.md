# AGENTS.md

## Source of truth

- Treat GitHub as the source of truth for this repository.
- Make code, configuration, and documentation changes through the GitHub integration on a dedicated branch and pull request.
- Use the Windows desktop only as a verification machine. Do not push from the desktop checkout.
- Never read, print, copy, or commit secrets from `.dev.vars`.

## Windows verification target

- Remote Desktop Commander device: `ericwalnut`
- Repository: `C:\Users\hs902\game-platform`
- PowerShell may block `npm.ps1`; invoke npm as `npm.cmd`.

## Required verification workflow

Before running checks on the desktop:

1. Confirm the device is online.
2. Run `git status --short --branch`.
3. If tracked files have local changes, or an untracked file would conflict with checkout, stop and report it. Never reset, clean, delete, stash, or overwrite user work.
4. Run `git fetch --prune origin`.
5. Check out the exact remote branch or commit being verified without modifying it locally.

Run the full local verification from the repository root:

```powershell
npm.cmd run verify
```

This command must cover preflight checks, TypeScript, unit tests, simulation smoke tests, migration checks, production build, desktop Chromium E2E, and mobile Chromium E2E.

After verification:

- Report the exact commit, each check result, and any failed test names.
- If Playwright output is interrupted by process cleanup, inspect `test-results/.last-run.json`; do not infer success without a recorded passing status or exit code.
- Do not commit generated build output, Playwright results, Wrangler state, or local secrets.
- Restore the checkout to `main` when practical, without disturbing local files.

## Safety boundaries

- Do not deploy, apply remote D1 migrations, change Cloudflare secrets, or install a self-hosted GitHub Actions runner unless the user explicitly requests that action.
- Local D1 migrations used by Playwright are allowed because they target Wrangler's local state.
