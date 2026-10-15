import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
const appRoot = fileURLToPath(new URL('..', import.meta.url));
const directory = resolve(process.env.DATA_DIR || join(appRoot, 'data'));
const backupDirectory = resolve(process.env.BACKUP_DIR || join(directory, 'backups'));
mkdirSync(backupDirectory, { recursive: true });
const file = join(backupDirectory, 'q-mate-' + new Date().toISOString().replaceAll(/[:.]/g, '-') + '.sqlite');
// Open the existing database, never seed or create an empty replacement.
const db = new DatabaseSync(join(directory, 'relay.sqlite'), { readOnly: true });
try {
  db.exec('PRAGMA busy_timeout=5000');
  db.prepare('VACUUM INTO ?').run(file);
} finally { db.close(); }
const copy = new DatabaseSync(file, { readOnly: true });
try {
  if (copy.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Backup integrity check failed.');
  console.log(JSON.stringify({ file, verifiedAt: new Date().toISOString(),
    customers: copy.prepare('SELECT COUNT(*) AS n FROM customers').get().n }));
} finally { copy.close(); }
