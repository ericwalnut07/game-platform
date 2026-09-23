# Cloudflare deployment checklist

This project is designed for React + Vite on Cloudflare Workers, with one Durable Object per room and optional D1 logging/room directory.

## 1. Local prerequisites

- Node.js 24+
- Git
- Cloudflare account
- GitHub repository (recommended)

```bash
npm install
npm run preflight
npm run typecheck
npm test
npm run smoke
npm run test:migrations
npm run build
```

Commit the generated `package-lock.json` after the first successful `npm install`.

## 2. Authenticate Wrangler

```bash
npx wrangler login
npx wrangler whoami
```

Never paste the Cloudflare password or API token into source files.

## 3. Create D1

D1 is optional for the game engine itself, but required for the public room list, playtest logs, analytics, operations logs, and automated log maintenance.

```bash
npx wrangler d1 create game-platform-db
```

Add the returned ID to `wrangler.jsonc`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "game-platform-db",
    "database_id": "REPLACE_WITH_YOUR_DATABASE_ID"
  }
]
```

Apply migrations locally first, then remotely:

```bash
npx wrangler d1 migrations apply game-platform-db --local
npx wrangler d1 migrations apply game-platform-db --remote
```

Current migrations: `0001` through `0007`.

## 4. Owner/admin secrets

Playtest analytics:

```bash
npx wrangler secret put ANALYTICS_TOKEN
```

Operations / manual maintenance:

```bash
npx wrangler secret put ADMIN_TOKEN
```

Use separate long random values. Do not commit either token.

Optional retention overrides can be supplied as Worker variables or local `.dev.vars` values:

```text
STALE_ROOM_HOURS=24
PLAYTEST_EVENT_RETENTION_DAYS=180
ERROR_RETENTION_DAYS=30
```

The default policy deletes only stale room-directory rows, old phase/action event logs, and old operational error logs. Finished match/game/player/feedback records are retained.

## 5. Daily maintenance cron

`wrangler.jsonc` contains:

```jsonc
"triggers": {
  "crons": ["17 3 * * *"]
}
```

This runs maintenance once per day. The schedule is UTC. Maintenance can also be previewed or run from `/#/operations` with `ADMIN_TOKEN`.

## 6. Room lifecycle

Each room is a Durable Object and expires independently:

- waiting (`OPEN` / `READY`): 2 hours without activity
- playing: 6 hours without activity
- finished: 1 hour after match completion
- closed/empty: about 1 minute

Room expiry removes the Durable Object's room/session/request-deduplication state and removes the room from the D1 public directory. Playtest results already stored in D1 are not deleted.

## 7. Local Cloudflare runtime test

```bash
npm run dev
```

Check:

- `/api/health`
- TOP page
- Create room
- Join with 2 additional browser sessions
- Start a match
- Reload one browser during play and verify restoration
- `/#/analytics` with `ANALYTICS_TOKEN`
- `/#/operations` with `ADMIN_TOKEN`

## 8. Deploy

Production deployment requires an explicit request. Run the full gate first (including desktop and mobile E2E):

```bash
npm run verify
npm run deploy
```

After deployment, open `/api/health`. Expected fields include `ok: true`, `durableObjects: true`, and the configured-state flags.

Windows verification uses Remote Desktop Commander on `ericwalnut` and `npm.cmd run verify`. Follow [AGENTS.md](./AGENTS.md) for checkout safety and result reporting. GitHub Actions runs in GitHub's CI environment; no Windows self-hosted runner is installed.

## 9. GitHub deployment option

For automated production deployment, configure these GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Keep production deploy as a separate workflow after CI passes, and apply D1 migrations deliberately rather than silently changing the database schema from an arbitrary feature branch.

## Recovery notes

- A browser reload uses the locally stored room session to reconnect.
- Mobile sleep/network changes trigger automatic WebSocket replacement and fresh state delivery.
- Before a match, a disconnected host has a 10-second recovery grace period. After that the host is removed from the lobby and the earliest connected guest becomes host.
- During a match, host status does not control progression; the server remains authoritative.
- Removed lobby players have their Durable Object session hashes and request-deduplication history pruned.
- Expired rooms close their WebSockets and delete their Durable Object storage.


## v0.9 更新時

v0.9では `0006_external_playtest.sql` が追加されています。コードをv0.9へ更新した後、ローカル確認前に:

```bash
npx wrangler d1 migrations apply game-platform-db --local
```

本番へv0.9をdeployする前に:

```bash
npx wrangler d1 migrations list game-platform-db --remote
npx wrangler d1 migrations apply game-platform-db --remote
```

を実行してください。本番D1へ0006を適用してからv0.9コードをdeployします。

## v0.9.1 公開時の区別

v0.9.1のコードに含まれるD1 migrationは0001〜0006です。0006が既に適用済みの本番DBでは、この版のために新しいmigrationを作成する必要はありません。適用状況は公開を明示的に依頼された際に確認します。

実装・CI/Windows検証・mainへのマージ・本番deploy・本番スモークを区別して記録してください。テスト成功やmainの版表示だけを本番公開済みの根拠にしません。


## v0.10.0 / 商都開発 v0.1 公開時

v0.10.0では `0007_commercial_hub.sql` が追加されています。
本番deploy前に本番D1の適用状況を確認し、未適用ならコードより先にmigrationを適用します。

```bash
npx wrangler d1 migrations list game-platform-db --remote
npx wrangler d1 migrations apply game-platform-db --remote
```

`0007` 適用後に v0.10.0 をdeployし、`/api/health` の版表示と `commercial-hub` の本番起動を確認します。
