## Database Transfer

The project now includes a generic Postgres transfer tool in
[`scripts/db-transfer.ts`](/Users/valentinabruzzi/Desktop/restaurant-bar-ordering copia/scripts/db-transfer.ts).

It works in 3 modes:

- `export`: reads the current source database and writes a JSON snapshot
- `import`: imports a JSON snapshot into another Postgres database
- `copy`: reads from the source database and writes directly into the target database

### Environment variables

- `DATABASE_URL`: current source database
- `SOURCE_DATABASE_URL`: optional explicit source override
- `TARGET_DATABASE_URL`: destination database
- `DB_TRANSFER_FILE`: optional default snapshot path

### Commands

```bash
npm run db:transfer:export -- ./tmp/db-snapshot.json
npm run db:transfer:import -- ./tmp/db-snapshot.json
npm run db:transfer:copy
npm run db:backup:archive
npm run db:restore:drill -- ./tmp/db-snapshot.json
```

### Notes

- `import` and `copy` are destructive for the target database: they truncate all app tables first.
- This tool preserves the existing ids and relations between restaurants, tables, products, orders, rewards, payments, staff requests and staff users.
- If the Prisma source database is currently blocked by quota, live export will fail until the source is reachable again. In that case restore the latest backup snapshot first, then run the transfer against the restored source.
- `db:backup:archive` writes timestamped snapshots under `tmp/backups/` by default.
- `db:restore:drill` imports a snapshot into a drill database and verifies the key table counts and order-item integrity.
