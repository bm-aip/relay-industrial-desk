import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { seedTenants } from './seed.mjs';
import { DomainError, id } from './domain.mjs';

export function openStore(directory, seedDemo = true) {
  const dir = resolve(directory);
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, 'relay.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.exec('CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, document TEXT NOT NULL);' +
    'CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id), type TEXT NOT NULL, subject TEXT NOT NULL, detail TEXT NOT NULL, at TEXT NOT NULL);');
  const get = db.prepare('SELECT document FROM customers WHERE id=?');
  const save = db.prepare('INSERT INTO customers(id,document) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document');
  const event = db.prepare('INSERT INTO events(id,customer_id,type,subject,detail,at) VALUES(?,?,?,?,?,?)');
  if (seedDemo && !db.prepare('SELECT COUNT(*) AS count FROM customers').get().count) {
    for (const tenant of seedTenants()) {
      save.run(tenant.id, JSON.stringify(tenant));
      event.run(id('event'), tenant.id, 'workspace.created', tenant.name, 'Fictional demonstration records loaded.', new Date().toISOString());
      for (const e of tenant.enquiries.filter((e) => e.status === 'awaiting_approval')) {
        event.run(id('event'), tenant.id, 'quote.drafted', e.reference, e.buyer + ' · Human approval required.', e.quote.draftedAt);
      }
    }
  }
  return {
    list() { return db.prepare('SELECT document FROM customers').all().map((r) => JSON.parse(r.document)); },
    get(customerId) {
      const row = get.get(customerId);
      if (!row) throw new DomainError('Customer workspace not found.', 404);
      return JSON.parse(row.document);
    },
    events(customerId) { return db.prepare('SELECT * FROM events WHERE customer_id=? ORDER BY at DESC, rowid DESC LIMIT 250').all(customerId); },
    insert(tenant) {
      save.run(tenant.id, JSON.stringify(tenant));
      event.run(id('event'), tenant.id, 'workspace.created', tenant.name, 'Empty prototype workspace created.', new Date().toISOString());
      return tenant;
    },
    mutate(customerId, fn) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const tenant = this.get(customerId);
        const result = fn(tenant);
        save.run(tenant.id, JSON.stringify(tenant));
        if (result?.event) {
          const e = result.event;
          event.run(id('event'), tenant.id, e.type, e.subject, e.detail, new Date().toISOString());
        }
        db.exec('COMMIT');
        return result?.value ?? tenant;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    close() { db.close(); }
  };
}
