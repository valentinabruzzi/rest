## Reliability Playbook

This project now uses a pragmatic resilience stack focused on critical staff and admin flows:

- strong read caching
- automatic temporary mode when network or database are unstable
- client outbox for critical staff writes
- idempotent staff order creation
- retry with backoff on critical reads and writes
- client-side circuit breakers to avoid hammering an already failing backend
- local runtime metrics for failures, retries, breaker opens, queue size, and flushes
- backup/export and restore drill scripts

### Runtime strategy

#### Reads

- `fetchJsonWithRetry` retries temporary or network failures with exponential backoff and jitter
- cached snapshots are used when fresh data cannot be reached
- circuit breakers pause repeated reads for a short cooldown when the same area keeps failing

#### Writes

- critical staff writes are pushed into a device outbox when the backend is unstable
- the outbox flushes automatically when health checks recover
- staff order creation uses `clientMutationId` to prevent duplicate orders after retries or delayed flushes

#### Reconciliation

- after a successful outbox flush, the staff dashboard reloads authoritative server state
- normal polling plus realtime events keep local state aligned after recovery

### Local metrics

Runtime metrics are stored in browser local storage and currently track:

- successes
- failures
- retry counts
- breaker opens
- buffered action count
- successful and failed outbox flushes
- last queue length

### Backup and restore drill

Create a timestamped backup snapshot:

```bash
npm run db:backup:archive
```

Restore a snapshot into a drill database and verify the main relations:

```bash
TARGET_DATABASE_URL=postgres://... npm run db:restore:drill -- ./tmp/backups/<timestamp>/db-snapshot.json
```

Environment variables:

- `DATABASE_URL` or `SOURCE_DATABASE_URL`: source database for export
- `TARGET_DATABASE_URL`: restore-drill target database
- `RESTORE_DRILL_DATABASE_URL`: optional dedicated restore-drill database
- `DB_BACKUP_DIR`: optional backup output directory

### Suggested operating routine

1. run `npm run db:backup:archive` daily
2. run `npm run db:restore:drill` on a separate drill database weekly
3. monitor outbox queue length and breaker activity during service
4. only switch primary database connections after a restore drill succeeds
