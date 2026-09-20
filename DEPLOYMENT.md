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

Current migrations: `0001` through `0006`.

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

Run the full gate first:

```bash
npm run deploy:check
npm run deploy
```

After deployment, open `/api/health`. Expected fields include `ok: true`, `durableObjects: true`, and the configured-state flags.

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
