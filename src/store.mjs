import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { seedTenants } from './seed.mjs';
import { DomainError, id } from './domain.mjs';
import { normaliseTenant } from './workflow.mjs';

export function openStore(directory, seedDemo = true) {
  const dir = resolve(directory);
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, 'relay.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  const legacy = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='customers'").get() &&
    !db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (legacy) {
    const backups = join(dir, 'backups'); mkdirSync(backups, { recursive: true });
    db.prepare('VACUUM INTO ?').run(join(backups, 'pre-v0.2-' + Date.now() + '.sqlite'));
  }
  db.exec('CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, document TEXT NOT NULL);' +
    'CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id), type TEXT NOT NULL, subject TEXT NOT NULL, detail TEXT NOT NULL, at TEXT NOT NULL);');
  if (!db.prepare('PRAGMA table_info(events)').all().some((x) => x.name === 'actor')) db.exec("ALTER TABLE events ADD COLUMN actor TEXT NOT NULL DEFAULT 'Legacy team record'");
  db.exec("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL, admin INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, memberships TEXT NOT NULL DEFAULT '[]');" +
    'CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires INTEGER NOT NULL);' +
    "CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id), operation_key TEXT UNIQUE NOT NULL, document TEXT NOT NULL);" +
    'CREATE INDEX IF NOT EXISTS events_workspace_time ON events(customer_id,at);');
  const userRecord = (r) => r ? { id: r.id, email: r.email, name: r.name, passwordHash: r.password_hash,
    admin: !!r.admin, active: !!r.active, memberships: JSON.parse(r.memberships) } : null;
  const get = db.prepare('SELECT document FROM customers WHERE id=?');
  const save = db.prepare('INSERT INTO customers(id,document) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document');
  const event = db.prepare('INSERT INTO events(id,customer_id,type,subject,detail,at,actor) VALUES(?,?,?,?,?,?,?)');
  if (seedDemo && !db.prepare('SELECT COUNT(*) AS count FROM customers').get().count) {
    for (const tenant of seedTenants()) {
      save.run(tenant.id, JSON.stringify(normaliseTenant(tenant)));
      event.run(id('event'), tenant.id, 'workspace.created', tenant.name, 'Fictional demonstration records loaded.', new Date().toISOString(), 'Demo loader');
      for (const e of tenant.enquiries.filter((e) => e.status === 'awaiting_approval')) {
          event.run(id('event'), tenant.id, 'quote.drafted', e.reference, e.buyer + ' · Human approval required.', e.quote.draftedAt, 'Demo loader');
      }
    }
  }
  return {
    list() { return db.prepare('SELECT document FROM customers').all().map((r) => normaliseTenant(JSON.parse(r.document))); },
    get(customerId) {
      const row = get.get(customerId);
      if (!row) throw new DomainError('Customer workspace not found.', 404);
      return normaliseTenant(JSON.parse(row.document));
    },
    events(customerId) { return db.prepare('SELECT * FROM events WHERE customer_id=? ORDER BY at DESC, rowid DESC LIMIT 250').all(customerId); },
    insert(tenant) {
      save.run(tenant.id, JSON.stringify(normaliseTenant(tenant)));
      event.run(id('event'), tenant.id, 'workspace.created', tenant.name, 'Workspace created.', new Date().toISOString(), tenant.createdBy || 'Unknown');
      return tenant;
    },
    mutate(customerId, fn, actor = 'System') {
      db.exec('BEGIN IMMEDIATE');
      try {
        const tenant = this.get(customerId);
        const result = fn(tenant);
        save.run(tenant.id, JSON.stringify(tenant));
        if (result?.event) {
          const e = result.event;
          event.run(id('event'), tenant.id, e.type, e.subject, e.detail, new Date().toISOString(), actor);
        }
        for (const job of result?.jobs || []) db.prepare('INSERT OR IGNORE INTO jobs(id,customer_id,operation_key,document) VALUES(?,?,?,?)')
          .run(job.id, customerId, job.key, JSON.stringify(job));
        db.exec('COMMIT');
        return result?.value ?? tenant;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    userCount() { return db.prepare('SELECT COUNT(*) AS n FROM users').get().n; },
    users() { return db.prepare('SELECT * FROM users ORDER BY email').all().map(userRecord); },
    user(userId) { return userRecord(db.prepare('SELECT * FROM users WHERE id=?').get(userId)); },
    userByEmail(email) { return userRecord(db.prepare('SELECT * FROM users WHERE email=?').get(email)); },
    saveUser(u) {
      const old = this.user(u.id);
      if (old?.admin && (!u.admin || !u.active) && this.users().filter((x) => x.active && x.admin).length <= 1) throw new DomainError('Keep at least one active administrator.');
      const duplicate = this.userByEmail(u.email);
      if (duplicate && duplicate.id !== u.id) throw new DomainError('A user with this email already exists.', 409);
      db.prepare('INSERT INTO users(id,email,name,password_hash,admin,active,memberships) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,password_hash=excluded.password_hash,admin=excluded.admin,active=excluded.active,memberships=excluded.memberships')
        .run(u.id, u.email, u.name, u.passwordHash, +u.admin, +u.active, JSON.stringify(u.memberships));
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
      return this.user(u.id);
    },
    createSession(hash, userId, csrf, expires) {
      db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
      db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash, userId, csrf, expires);
    },
    session(hash) { return db.prepare('SELECT user_id AS userId,csrf,expires FROM sessions WHERE token_hash=? AND expires>?').get(hash, Date.now()); },
    deleteSession(hash) { db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash); },
    jobs(customerId) { return db.prepare('SELECT document FROM jobs' + (customerId ? ' WHERE customer_id=?' : '')).all(...(customerId ? [customerId] : [])).map((r) => JSON.parse(r.document)); },
    saveJob(j) { db.prepare('UPDATE jobs SET document=? WHERE id=?').run(JSON.stringify(j), j.id); },
    backup(file) {
      db.exec('PRAGMA wal_checkpoint(FULL)');
      db.prepare('VACUUM INTO ?').run(file);
      return { at: new Date().toISOString(), path: file };
    },
    close() { db.close(); }
  };
}
