## Neon Recovery

When the old Neon database becomes reachable again, use the prepared recovery helper:

```bash
npm run db:recover:neon -- check
npm run db:recover:neon -- export ./tmp/neon-recovery-snapshot.json
npm run db:recover:neon -- copy
```

What it does:

- `check`: verifies the remote Neon backup is reachable and prints basic counts
- `export`: saves a JSON snapshot from Neon to a local file
- `copy`: copies the full remote dataset into the current local PostgreSQL database

Notes:

- The helper reads the remote connection from `.env.neon.backup.local`
- The local target database stays the one in `DATABASE_URL`
- `copy` is destructive for the local target, because it imports the full remote snapshot
- If Neon returns a quota or connectivity error, retry the same command after the remote plan is available again
